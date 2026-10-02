/**
 * Auth repository: durable sessions + refresh tokens with family-based reuse
 * detection (SEC-004).
 *
 * These tables intentionally have no row-level security: they are the
 * authentication infrastructure itself and are read before a tenant context
 * exists. They contain no PHI. All access goes through this repository.
 *
 * Refresh rotation is an atomic compare-and-set: the UPDATE only matches the
 * currently active token of the family, so concurrent rotations cannot fork
 * a family.
 */
import crypto from "crypto";
import type { Tx } from "../client.js";

const sha256 = (s: string): string => crypto.createHash("sha256").update(s).digest("hex");

export const REFRESH_TOKEN_BYTES = 48;
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export interface SessionRecord {
  id: string;
  userId: string;
  clinicId: string;
  deviceLabel: string | null;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}

export class AuthRepository {
  constructor(private tx: Tx) {}

  async createSession(
    userId: string,
    clinicId: string,
    deviceLabel?: string,
  ): Promise<SessionRecord> {
    const s = await this.tx.session.create({
      data: {
        userId,
        clinicId,
        deviceLabel,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      },
    });
    return s;
  }

  async findActiveSession(sessionId: string): Promise<SessionRecord | null> {
    const s = await this.tx.session.findUnique({ where: { id: sessionId } });
    if (!s) return null;
    if (s.revokedAt || s.expiresAt < new Date()) return null;
    return s;
  }

  async touchSession(sessionId: string): Promise<void> {
    await this.tx.session.update({
      where: { id: sessionId },
      data: { lastSeenAt: new Date() },
    }).catch(() => undefined);
  }

  /** Open the privileged step-up window on the session (5 minutes). */
  async markStepUp(sessionId: string): Promise<void> {
    await this.tx.session.update({
      where: { id: sessionId },
      data: { stepUpAt: new Date() },
    });
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.tx.session.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    }).catch(() => undefined);
    await this.tx.refreshToken.updateMany({
      where: { sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.tx.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.tx.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async listSessions(userId: string): Promise<SessionRecord[]> {
    return this.tx.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastSeenAt: "desc" },
    });
  }

  // ------------------------------------------------------------ refresh tokens

  /** Issues the first refresh token of a new family, bound to a session. */
  async issueRefreshToken(sessionId: string, userId: string, clinicId: string): Promise<string> {
    const raw = crypto.randomBytes(REFRESH_TOKEN_BYTES).toString("hex");
    const familyId = crypto.randomUUID();
    await this.tx.refreshToken.create({
      data: {
        familyId,
        userId,
        clinicId,
        sessionId,
        tokenHash: sha256(raw),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    });
    return raw;
  }

  /**
   * Atomic rotation with reuse detection.
   *
   * Returns:
   *  - { status: "rotated", raw } with a fresh token; the family head moved.
   *  - { status: "reused", userId, clinicId } when a revoked token was
   *    replayed: the whole family (and its session) is revoked to contain
   *    the attacker, and the identifiers allow a proper audit event.
   *  - { status: "invalid" } for unknown/expired tokens.
   */
  async rotateRefreshToken(
    rawToken: string,
  ): Promise<
    | { status: "rotated"; raw: string; userId: string; clinicId: string; sessionId: string }
    | { status: "reused"; userId: string; clinicId: string }
    | { status: "invalid" }
  > {
    const tokenHash = sha256(rawToken);
    const record = await this.tx.refreshToken.findUnique({ where: { tokenHash } });
    if (!record) return { status: "invalid" };
    if (record.expiresAt < new Date()) return { status: "invalid" };

    if (record.revokedAt) {
      // Reuse of a rotated token: revoke the entire family + session.
      await this.tx.refreshToken.updateMany({
        where: { familyId: record.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.tx.session.update({
        where: { id: record.sessionId },
        data: { revokedAt: new Date() },
      }).catch(() => undefined);
      return { status: "reused", userId: record.userId, clinicId: record.clinicId };
    }

    const newRaw = crypto.randomBytes(REFRESH_TOKEN_BYTES).toString("hex");
    const next = await this.tx.refreshToken.create({
      data: {
        familyId: record.familyId,
        userId: record.userId,
        clinicId: record.clinicId,
        sessionId: record.sessionId,
        tokenHash: sha256(newRaw),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    });
    // Compare-and-set: only succeeds if the token is still the family head.
    const cas = await this.tx.refreshToken.updateMany({
      where: { id: record.id, revokedAt: null },
      data: { revokedAt: new Date(), replacedById: next.id },
    });
    if (cas.count !== 1) {
      // Lost a rotation race: revoke everything in the family (safe default).
      await this.tx.refreshToken.updateMany({
        where: { familyId: record.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.tx.refreshToken.delete({ where: { id: next.id } }).catch(() => undefined);
      return { status: "reused", userId: record.userId, clinicId: record.clinicId };
    }
    return {
      status: "rotated",
      raw: newRaw,
      userId: record.userId,
      clinicId: record.clinicId,
      sessionId: record.sessionId,
    };
  }

  async revokeRefreshToken(rawToken: string): Promise<void> {
    const tokenHash = sha256(rawToken);
    const record = await this.tx.refreshToken.findUnique({ where: { tokenHash } });
    if (record && !record.revokedAt) {
      await this.tx.refreshToken.update({
        where: { id: record.id },
        data: { revokedAt: new Date() },
      });
    }
  }
}

export const _hashTokenForTesting = sha256;
