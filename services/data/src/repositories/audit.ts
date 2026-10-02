/**
 * Audit trail repository: append-only, tamper-evident per-clinic hash chain.
 *
 * Concurrency: the append takes a per-clinic advisory transaction lock so the
 * chain never forks. Legacy rows (pre-v2 migration) are skipped during
 * recomputation but still link the chain head.
 */
import crypto from "crypto";
import type { Tx } from "../client.js";
import { lockAuditChain } from "../tenant.js";
import type {
  AuditAction,
  AuditEventInput,
  AuditEvent,
  AuditVerification,
  AuditQuery,
} from "@medical/contracts";
import type { Paginated } from "@medical/contracts";
import { hashIp } from "../crypto.js";

const GENESIS = crypto.createHash("sha256").update("GENESIS_BLOCK").digest("hex");

/**
 * Deterministic JSON for hashing: PostgreSQL jsonb does not preserve key
 * order, so every nested object is stringified with sorted keys. Used for
 * both appending and verification, making the chain stable across
 * round-trips through the database.
 */
const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
};

export interface ActorContext {
  /** accepts both tenantId (domain ctx) and clinicId */
  tenantId?: string;
  clinicId?: string;
  actorId?: string;
  actorRole?: string;
  requestId?: string;
  sourceIp?: string;
}

const resolveClinicId = (ctx: ActorContext): string => {
  const id = ctx.tenantId ?? ctx.clinicId;
  if (!id) throw new Error("audit: missing tenant id");
  return id;
};

export class AuditRepository {
  constructor(private tx: Tx) {}

  async append(ctx: ActorContext, input: AuditEventInput): Promise<void> {
    const clinicId = resolveClinicId(ctx);
    await lockAuditChain(this.tx, clinicId);

    const prev = await this.tx.auditLog.findFirst({
      where: { clinicId },
      orderBy: { seq: "desc" },
      select: { hash: true, chainIndex: true },
    });

    const createdAt = new Date();
    const canonical = JSON.stringify({
      a: input.action,
      c: input.category,
      actor: input.actorId ?? null,
      role: input.actorRole ?? null,
      patient: input.subjectPatientId ?? null,
      target: input.target ?? null,
      purpose: input.purpose ?? null,
      d: stableStringify(input.details ?? {}),
      at: createdAt.toISOString(),
    });
    const hash = crypto
      .createHash("sha256")
      .update((prev?.hash ?? GENESIS) + canonical)
      .digest("hex");

    await this.tx.auditLog.create({
      data: {
        clinicId,
        // Per-clinic position: written under the advisory lock so the
        // continuity check can rely on 0..N-1 with no holes.
        chainIndex: (prev?.chainIndex ?? -1) + 1,
        action: input.action,
        category: input.category,
        actorId: input.actorId ?? null,
        actorRole: input.actorRole ?? null,
        subjectPatientId: input.subjectPatientId ?? null,
        target: input.target ?? null,
        purpose: input.purpose ?? null,
        requestId: ctx.requestId ?? null,
        details: (input.details ?? {}) as object,
        sourceIpHash: hashIp(ctx.sourceIp),
        prevHash: prev?.hash ?? GENESIS,
        hash,
        createdAt,
      },
    });
  }

  async query(clinicId: string, q: AuditQuery): Promise<Paginated<AuditEvent>> {
    const where = {
      clinicId,
      // Keyset pagination (PERF-001): a cursor walk stays O(limit) on the
      // (clinic_id, seq) index regardless of how deep the page is.
      ...(q.cursor ? { seq: { lt: q.cursor } } : {}),
      ...(q.action ? { action: q.action } : {}),
      ...(q.category ? { category: q.category } : {}),
      ...(q.subjectPatientId ? { subjectPatientId: q.subjectPatientId } : {}),
      ...(q.actorId ? { actorId: q.actorId } : {}),
      ...(q.from || q.to
        ? {
            createdAt: {
              ...(q.from ? { gte: new Date(q.from) } : {}),
              ...(q.to ? { lte: new Date(q.to) } : {}),
            },
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.tx.auditLog.count({ where: q.cursor ? { clinicId } : where }),
      this.tx.auditLog.findMany({
        where,
        orderBy: { seq: "desc" },
        skip: q.cursor ? 0 : (q.page - 1) * q.limit,
        take: q.limit,
      }),
    ]);
    const actorIds = [...new Set(rows.map((r) => r.actorId).filter((x): x is string => Boolean(x)))];
    const actors = actorIds.length
      ? await this.tx.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, fullName: true } })
      : [];
    const actorNames = new Map(actors.map((a) => [a.id, a.fullName]));
    return {
      total,
      page: q.page,
      limit: q.limit,
      pageCount: Math.max(1, Math.ceil(total / q.limit)),
      items: rows.map((r) => ({
        id: r.id,
        seq: r.seq,
        action: r.action,
        category: r.category,
        actorId: r.actorId,
        actorName: r.actorId ? actorNames.get(r.actorId) ?? null : null,
        actorRole: r.actorRole,
        subjectPatientId: r.subjectPatientId,
        target: r.target,
        purpose: r.purpose,
        details: (r.details ?? {}) as Record<string, unknown>,
        createdAt: r.createdAt.toISOString(),
        hash: r.hash,
      })),
    };
  }

  /**
   * Continuity check (AUD-001): the per-clinic chain index must be exactly
   * 0..N-1. A deleted row leaves a hole that stays visible even when an
   * attacker recomputes the hashes of the remaining chain.
   */
  async verifyContinuity(clinicId: string): Promise<{ continuityValid: boolean; continuityGaps: number; firstGapIndex: number | null }> {
    const rows = await this.tx.auditLog.findMany({
      where: { clinicId },
      orderBy: { chainIndex: "asc" },
      select: { chainIndex: true },
    });
    let firstGapIndex: number | null = null;
    for (let i = 0; i < rows.length; i += 1) {
      if (rows[i]!.chainIndex !== i) {
        firstGapIndex = i;
        break;
      }
    }
    const continuityGaps = firstGapIndex === null ? 0 : rows.length - firstGapIndex;
    return { continuityValid: firstGapIndex === null, continuityGaps, firstGapIndex };
  }

  async verifyChain(clinicId: string): Promise<AuditVerification> {
    const rows = await this.tx.auditLog.findMany({
      where: { clinicId },
      orderBy: { seq: "asc" },
      select: {
        seq: true,
        action: true,
        category: true,
        actorId: true,
        actorRole: true,
        subjectPatientId: true,
        target: true,
        purpose: true,
        details: true,
        createdAt: true,
        prevHash: true,
        hash: true,
      },
    });

    let expectedPrev: string | null = null;
    let verified = 0;
    let legacy = 0;
    const continuity = await this.verifyContinuity(clinicId);

    for (const r of rows) {
      const details = (r.details ?? {}) as Record<string, unknown>;
      const isLegacy = details.legacy === true;
      if (isLegacy) {
        legacy += 1;
        expectedPrev = r.hash; // chain from the legacy tail
        continue;
      }
      const canonical = JSON.stringify({
        a: r.action,
        c: r.category,
        actor: r.actorId,
        role: r.actorRole,
        patient: r.subjectPatientId,
        target: r.target,
        purpose: r.purpose,
        d: stableStringify(details),
        at: r.createdAt.toISOString(),
      });
      const recomputed = crypto
        .createHash("sha256")
        .update((r.prevHash ?? GENESIS) + canonical)
        .digest("hex");
      const prevOk = expectedPrev === null || r.prevHash === expectedPrev;
      if (recomputed !== r.hash || !prevOk) {
        return {
          valid: false,
          verifiedCount: verified,
          legacyCount: legacy,
          firstBrokenAt: r.createdAt.toISOString(),
          ...continuity,
        };
      }
      expectedPrev = r.hash;
      verified += 1;
    }

    return {
      valid: true,
      verifiedCount: verified,
      legacyCount: legacy,
      firstBrokenAt: null,
      ...continuity,
    };
  }

  async exportForPatient(clinicId: string, patientId: string): Promise<AuditEvent[]> {
    const rows = await this.tx.auditLog.findMany({
      where: { clinicId, subjectPatientId: patientId },
      orderBy: { seq: "asc" },
    });
    return rows.map((r) => ({
      id: r.id,
      seq: r.seq,
      action: r.action,
      category: r.category,
      actorId: r.actorId,
      actorName: null,
      actorRole: r.actorRole,
      subjectPatientId: r.subjectPatientId,
      target: r.target,
      purpose: r.purpose,
      details: (r.details ?? {}) as Record<string, unknown>,
      createdAt: r.createdAt.toISOString(),
      hash: r.hash,
    }));
  }
}

export type { AuditAction };
