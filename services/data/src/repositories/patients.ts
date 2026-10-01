/**
 * Patient repository. Handles PHI encryption/decryption and the deterministic
 * HMAC search indexes transparently.
 *
 * Lists return the minimum necessary projection (UX-003 / privacy by default):
 * no full identifiers, no contact data. Detail decryption happens only for
 * callers the API layer has already authorized with clinical:read or
 * patients:write + self.
 */
import crypto from "crypto";
import type { Tx } from "../client.js";
import { encryptPHI, decryptPHI, hmacIndex } from "../crypto.js";
import type {
  PatientCreate,
  PatientDetail,
  PatientListItem,
  PatientSearchQuery,
  PatientUpdate,
  Paginated,
} from "@medical/contracts";

/** Prisma unique-constraint violation (Postgres SQLSTATE 23505). */
const isUniqueViolation = (err: unknown): boolean =>
  typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "P2002";

export class PatientRepository {
  constructor(private tx: Tx) {}

  private async nextInternalRef(clinicId: string): Promise<string> {
    // eslint-disable-next-line no-secrets/no-secrets -- SQL pattern, not a secret
    const result = await this.tx.$queryRaw<{ next: bigint }[]>`
      SELECT COALESCE(MAX(NULLIF(regexp_replace(internal_ref, '\\D', '', 'g'), '')::bigint), 0) + 1 AS next
      FROM patients WHERE clinic_id = ${clinicId}`;
    const next = Number(result[0]?.next ?? 1);
    return `P-${String(next).padStart(6, "0")}`;
  }

  async search(clinicId: string, q: PatientSearchQuery): Promise<Paginated<PatientListItem>> {
    const trimmed = q.q.trim();
    const where = {
      clinicId,
      ...(q.status ? { status: q.status } : {}),
      ...(q.primaryDoctorId ? { primaryDoctorId: q.primaryDoctorId } : {}),
      ...(trimmed.length >= 2
        ? { OR: [{ fullName: { contains: trimmed, mode: "insensitive" as const } }, { internalRef: { contains: trimmed, mode: "insensitive" as const } }] }
        : {}),
    };

    const [total, rows] = await Promise.all([
      this.tx.patient.count({ where }),
      this.tx.patient.findMany({
        where,
        orderBy: { fullName: "asc" },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
        select: {
          id: true,
          internalRef: true,
          fullName: true,
          birthYear: true,
          sex: true,
          status: true,
          primaryDoctorId: true,
          primaryDoctor: { select: { fullName: true } },
        },
      }),
    ]);

    const ids = rows.map((r) => r.id);
    const lastVisits = ids.length
      ? await this.tx.appointment.groupBy({
          by: ["patientId"],
          where: { clinicId, patientId: { in: ids }, startTime: { lt: new Date() } },
          _max: { startTime: true },
        })
      : [];
    const lastVisitMap = new Map(lastVisits.map((v) => [v.patientId, v._max.startTime?.toISOString() ?? null]));

    return {
      total,
      page: q.page,
      limit: q.limit,
      pageCount: Math.max(1, Math.ceil(total / q.limit)),
      items: rows.map((r) => ({
        id: r.id,
        internalRef: r.internalRef,
        fullName: r.fullName,
        birthYear: r.birthYear,
        sex: r.sex,
        status: r.status,
        primaryDoctorId: r.primaryDoctorId,
        primaryDoctorName: r.primaryDoctor?.fullName ?? null,
        lastVisitAt: lastVisitMap.get(r.id) ?? null,
      })),
    };
  }

  async findById(clinicId: string, id: string): Promise<PatientDetail | null> {
    const p = await this.tx.patient.findFirst({
      where: { clinicId, id },
      include: {
        identifiers: true,
        consents: true,
      },
    });
    if (!p) return null;
    return {
      id: p.id,
      internalRef: p.internalRef,
      fullName: p.fullName,
      birthDate: decryptPHI(p.birthDateEnc),
      birthYear: p.birthYear,
      sex: p.sex,
      phone: decryptPHI(p.phoneEnc),
      email: decryptPHI(p.emailEnc),
      address: decryptPHI(p.addressEnc),
      status: p.status,
      primaryDoctorId: p.primaryDoctorId,
      defaultPayerId: p.defaultPayerId,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      identifiers: p.identifiers.map((i) => ({
        id: i.id,
        type: i.type,
        value: decryptPHI(i.valueEnc) ?? "",
        isPrimary: i.isPrimary,
      })),
      consents: p.consents.map((c) => ({
        id: c.id,
        type: c.type,
        status: c.status,
        grantedAt: c.grantedAt?.toISOString() ?? null,
        expiresAt: c.expiresAt?.toISOString() ?? null,
        note: c.note,
      })),
    };
  }

  /** Lightweight existence check that keeps RLS as the tenant boundary. */
  async exists(clinicId: string, id: string): Promise<boolean> {
    const p = await this.tx.patient.findFirst({ where: { clinicId, id }, select: { id: true } });
    return p !== null;
  }

  async create(clinicId: string, input: PatientCreate): Promise<PatientDetail> {
    const internalRef = await this.nextInternalRef(clinicId);
    const id = crypto.randomUUID();
    try {
      await this.tx.patient.create({
        data: {
          id,
          clinicId,
          internalRef,
          fullName: input.fullName.trim(),
          birthDateEnc: encryptPHI(input.birthDate),
          birthYear: input.birthDate ? Number(input.birthDate.slice(0, 4)) : null,
          sex: input.sex,
          phoneEnc: encryptPHI(input.phone),
          phoneHmac: hmacIndex(input.phone),
          emailEnc: encryptPHI(input.email),
          emailHmac: hmacIndex(input.email),
          addressEnc: encryptPHI(input.address),
          primaryDoctorId: input.primaryDoctorId,
          defaultPayerId: input.defaultPayerId,
        },
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new Error("DUPLICATE_INTERNAL_REF");
      }
      throw err;
    }
    for (const ident of input.identifiers) {
      if (!ident.value.trim()) continue;
      try {
        await this.tx.patientIdentifier.create({
          data: {
            clinicId,
            patientId: id,
            type: ident.type,
            valueEnc: encryptPHI(ident.value.trim()) ?? "",
            valueHmac: hmacIndex(ident.value),
            isPrimary: ident.isPrimary,
          },
        });
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new Error("DUPLICATE_IDENTIFIER");
        }
        throw err;
      }
    }
    const created = await this.findById(clinicId, id);
    if (!created) throw new Error("Patient creation failed");
    return created;
  }

  async update(clinicId: string, id: string, input: PatientUpdate): Promise<PatientDetail | null> {
    const existing = await this.tx.patient.findFirst({ where: { clinicId, id }, select: { id: true } });
    if (!existing) return null;

    const data: Record<string, unknown> = {};
    if (input.fullName !== undefined) data.fullName = input.fullName.trim();
    if (input.birthDate !== undefined) {
      data.birthDateEnc = encryptPHI(input.birthDate);
      data.birthYear = input.birthDate ? Number(input.birthDate.slice(0, 4)) : null;
    }
    if (input.sex !== undefined) data.sex = input.sex;
    if (input.phone !== undefined) {
      data.phoneEnc = encryptPHI(input.phone);
      data.phoneHmac = hmacIndex(input.phone);
    }
    if (input.email !== undefined) {
      data.emailEnc = encryptPHI(input.email);
      data.emailHmac = hmacIndex(input.email);
    }
    if (input.address !== undefined) data.addressEnc = encryptPHI(input.address);
    if (input.status !== undefined) data.status = input.status;
    if (input.primaryDoctorId !== undefined) data.primaryDoctorId = input.primaryDoctorId;
    if (input.defaultPayerId !== undefined) data.defaultPayerId = input.defaultPayerId;

    await this.tx.patient.update({ where: { id }, data });
    return this.findById(clinicId, id);
  }

  async archive(clinicId: string, id: string): Promise<boolean> {
    const existing = await this.tx.patient.findFirst({ where: { clinicId, id }, select: { id: true } });
    if (!existing) return false;
    await this.tx.patient.update({ where: { id }, data: { status: "ARCHIVED" } });
    return true;
  }

  async addIdentifier(
    clinicId: string,
    patientId: string,
    input: { type: string; value: string; isPrimary?: boolean },
  ): Promise<boolean> {
    const existing = await this.tx.patient.findFirst({
      where: { clinicId, id: patientId },
      select: { id: true },
    });
    if (!existing) return false;
    if (input.isPrimary) {
      await this.tx.patientIdentifier.updateMany({
        where: { patientId, isPrimary: true },
        data: { isPrimary: false },
      });
    }
    await this.tx.patientIdentifier.create({
      data: {
        clinicId,
        patientId,
        type: input.type as never,
        valueEnc: encryptPHI(input.value) ?? "",
        valueHmac: hmacIndex(input.value),
        isPrimary: input.isPrimary ?? false,
      },
    });
    return true;
  }

  async upsertConsent(
    clinicId: string,
    patientId: string,
    input: { type: string; status: string; note?: string; recordedById?: string },
  ): Promise<void> {
    await this.tx.patientConsent.upsert({
      where: { patientId_type: { patientId, type: input.type as never } },
      create: {
        clinicId,
        patientId,
        type: input.type as never,
        status: input.status as never,
        note: input.note,
        grantedAt: input.status === "GRANTED" ? new Date() : null,
        recordedById: input.recordedById,
      },
      update: {
        status: input.status as never,
        note: input.note,
        grantedAt: input.status === "GRANTED" ? new Date() : null,
        recordedById: input.recordedById,
      },
    });
  }

  async consentFor(clinicId: string, patientId: string, type: string): Promise<string | null> {
    const c = await this.tx.patientConsent.findFirst({
      where: { clinicId, patientId, type: type as never },
      select: { status: true },
    });
    return c?.status ?? null;
  }

  async hasCareRelationship(clinicId: string, patientId: string, doctorId: string): Promise<boolean> {
    const [appt, encounter, primary] = await Promise.all([
      this.tx.appointment.findFirst({
        where: { clinicId, patientId, doctorId },
        select: { id: true },
      }),
      this.tx.encounter.findFirst({
        where: { clinicId, patientId, doctorId },
        select: { id: true },
      }),
      this.tx.patient.findFirst({
        where: { clinicId, id: patientId, primaryDoctorId: doctorId },
        select: { id: true },
      }),
    ]);
    return Boolean(appt || encounter || primary);
  }
}
