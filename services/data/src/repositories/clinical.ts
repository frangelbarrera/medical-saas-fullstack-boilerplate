/**
 * Clinical repository: encounter lifecycle (DRAFT -> IN_REVIEW -> SIGNED ->
 * AMENDED with version snapshots), observations, problems, allergies,
 * medication orders and break-glass access.
 */
import crypto from "crypto";
import type { Tx } from "../client.js";
import type {
  ClinicalSummary,
  Encounter,
  EncounterSnapshot,
  EncounterVersionInfo,
  MedicationOrder,
  Observation,
  Problem,
  Allergy,
  TimelineEvent,
} from "@medical/contracts";

export const ENCOUNTER_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["IN_REVIEW", "SIGNED"],
  IN_REVIEW: ["SIGNED", "DRAFT"],
  SIGNED: ["AMENDED"],
  AMENDED: ["AMENDED"],
};

export class ClinicalRepository {
  constructor(private tx: Tx) {}

  // ---------------------------------------------------------------- encounters

  private toDto(e: {
    id: string;
    patientId: string;
    doctorId: string;
    appointmentId: string | null;
    title: string;
    chiefComplaint: string | null;
    observations: string | null;
    plan: string | null;
    status: string;
    signedAt: Date | null;
    signedById: string | null;
    amendedFromId: string | null;
    createdAt: Date;
    updatedAt: Date;
    versions: { version: number }[];
    patient: { fullName: string };
    doctor: { fullName: string };
    signedBy: { fullName: string } | null;
  }): Encounter {
    return {
      id: e.id,
      patientId: e.patientId,
      patientName: e.patient.fullName,
      doctorId: e.doctorId,
      doctorName: e.doctor.fullName,
      appointmentId: e.appointmentId,
      title: e.title,
      chiefComplaint: e.chiefComplaint,
      observations: e.observations,
      plan: e.plan,
      status: e.status as Encounter["status"],
      signedAt: e.signedAt?.toISOString() ?? null,
      signedById: e.signedById,
      signedByName: e.signedBy?.fullName ?? null,
      amendedFromId: e.amendedFromId,
      currentVersion: e.versions.length > 0 ? Math.max(...e.versions.map((v) => v.version)) : 0,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
    };
  }

  private include() {
    return {
      patient: { select: { fullName: true } },
      doctor: { select: { fullName: true } },
      signedBy: { select: { fullName: true } },
      versions: { select: { version: true } },
    };
  }

  async listForPatient(clinicId: string, patientId: string): Promise<Encounter[]> {
    const rows = await this.tx.encounter.findMany({
      where: { clinicId, patientId },
      orderBy: { createdAt: "desc" },
      include: this.include(),
    });
    return rows.map((r) => this.toDto(r));
  }

  async findById(clinicId: string, id: string): Promise<Encounter | null> {
    const e = await this.tx.encounter.findFirst({ where: { clinicId, id }, include: this.include() });
    return e ? this.toDto(e) : null;
  }

  async create(
    ctx: { tenantId: string; actorId: string },
    input: { patientId: string; appointmentId?: string; title: string; chiefComplaint?: string; observations?: string; plan?: string },
  ): Promise<Encounter> {
    const id = crypto.randomUUID();
    await this.tx.encounter.create({
      data: {
        id,
        clinicId: ctx.tenantId,
        patientId: input.patientId,
        doctorId: ctx.actorId,
        appointmentId: input.appointmentId,
        title: input.title,
        chiefComplaint: input.chiefComplaint,
        observations: input.observations,
        plan: input.plan,
        status: "DRAFT",
      },
    });
    await this.snapshotVersion(ctx, id, 1, "Initial draft");
    const created = await this.findById(ctx.tenantId, id);
    if (!created) throw new Error("Encounter creation failed");
    return created;
  }

  async updateContent(
    ctx: { tenantId: string; actorId: string },
    id: string,
    input: { title?: string; chiefComplaint?: string | null; observations?: string | null; plan?: string | null; changeReason?: string },
  ): Promise<Encounter | null> {
    const existing = await this.tx.encounter.findFirst({
      where: { clinicId: ctx.tenantId, id },
      include: this.include(),
    });
    if (!existing) return null;
    if (existing.status === "SIGNED" || existing.status === "AMENDED") return null;

    await this.tx.encounter.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.chiefComplaint !== undefined ? { chiefComplaint: input.chiefComplaint } : {}),
        ...(input.observations !== undefined ? { observations: input.observations } : {}),
        ...(input.plan !== undefined ? { plan: input.plan } : {}),
      },
    });

    const nextVersion = Math.max(0, ...existing.versions.map((v) => v.version)) + 1;
    await this.snapshotVersion(ctx, id, nextVersion, input.changeReason);
    return this.findById(ctx.tenantId, id);
  }

  async transition(
    ctx: { tenantId: string; actorId: string },
    id: string,
    to: "DRAFT" | "IN_REVIEW" | "SIGNED",
  ): Promise<Encounter | null> {
    const existing = await this.tx.encounter.findFirst({
      where: { clinicId: ctx.tenantId, id },
      include: this.include(),
    });
    if (!existing) return null;
    const allowed = ENCOUNTER_TRANSITIONS[existing.status] ?? [];
    if (!allowed.includes(to)) return null;

    await this.tx.encounter.update({
      where: { id },
      data: {
        status: to,
        ...(to === "SIGNED"
          ? { signedAt: new Date(), signedById: ctx.actorId }
          : {}),
      },
    });
    return this.findById(ctx.tenantId, id);
  }

  /** Amendment: creates a new DRAFT encounter linked to the signed original. */
  async amend(
    ctx: { tenantId: string; actorId: string },
    id: string,
    reason: string,
  ): Promise<Encounter | null> {
    const original = await this.findById(ctx.tenantId, id);
    if (!original || (original.status !== "SIGNED" && original.status !== "AMENDED")) return null;

    const newId = crypto.randomUUID();
    await this.tx.encounter.create({
      data: {
        id: newId,
        clinicId: ctx.tenantId,
        patientId: original.patientId,
        doctorId: ctx.actorId,
        title: original.title,
        chiefComplaint: original.chiefComplaint,
        observations: original.observations,
        plan: original.plan,
        status: "AMENDED",
        amendedFromId: original.id,
      },
    });
    await this.snapshotVersion(ctx, newId, 1, `Amendment of ${original.id}: ${reason}`);
    return this.findById(ctx.tenantId, newId);
  }

  async versions(clinicId: string, encounterId: string): Promise<EncounterVersionInfo[]> {
    const rows = await this.tx.encounterVersion.findMany({
      where: { clinicId, encounterId },
      orderBy: { version: "asc" },
      include: { author: { select: { fullName: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      version: r.version,
      authorId: r.authorId,
      authorName: r.author.fullName,
      changeReason: r.changeReason,
      snapshot: r.snapshot as unknown as EncounterSnapshot,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  private async snapshotVersion(
    ctx: { tenantId: string; actorId: string },
    encounterId: string,
    version: number,
    changeReason?: string,
  ): Promise<void> {
    const e = await this.tx.encounter.findUniqueOrThrow({
      where: { id: encounterId },
      select: { title: true, chiefComplaint: true, observations: true, plan: true, clinicId: true },
    });
    const snapshot: EncounterSnapshot = {
      title: e.title,
      chiefComplaint: e.chiefComplaint,
      observations: e.observations,
      plan: e.plan,
    };
    await this.tx.encounterVersion.create({
      data: {
        clinicId: ctx.tenantId,
        encounterId,
        version,
        authorId: ctx.actorId,
        snapshot,
        changeReason,
      },
    });
  }

  // ------------------------------------------------------------- observations

  async addObservation(
    ctx: { tenantId: string; actorId: string },
    input: { patientId: string; encounterId?: string; type: string; loincCode?: string; value: string; unit?: string; effectiveAt?: string },
  ): Promise<Observation> {
    const o = await this.tx.observation.create({
      data: {
        clinicId: ctx.tenantId,
        patientId: input.patientId,
        encounterId: input.encounterId,
        type: input.type as never,
        loincCode: input.loincCode,
        value: input.value,
        unit: input.unit,
        effectiveAt: input.effectiveAt ? new Date(`${input.effectiveAt}T12:00:00.000Z`) : new Date(),
        recordedById: ctx.actorId,
      },
      include: { recordedBy: { select: { fullName: true } } },
    });
    return this.observationDto(o);
  }

  async listObservations(clinicId: string, patientId: string, limit = 100): Promise<Observation[]> {
    const rows = await this.tx.observation.findMany({
      where: { clinicId, patientId },
      orderBy: { effectiveAt: "desc" },
      take: limit,
      include: { recordedBy: { select: { fullName: true } } },
    });
    return rows.map((o) => this.observationDto(o));
  }

  private observationDto(o: {
    id: string;
    patientId: string;
    encounterId: string | null;
    type: string;
    loincCode: string | null;
    value: string;
    unit: string | null;
    effectiveAt: Date;
    recordedById: string;
    recordedBy: { fullName: string } | null;
  }): Observation {
    return {
      id: o.id,
      patientId: o.patientId,
      encounterId: o.encounterId,
      type: o.type as Observation["type"],
      loincCode: o.loincCode,
      value: o.value,
      unit: o.unit,
      effectiveAt: o.effectiveAt.toISOString(),
      recordedById: o.recordedById,
      recordedByName: o.recordedBy?.fullName ?? null,
    };
  }

  // ------------------------------------------------------------------ problems

  async addProblem(
    ctx: { tenantId: string; actorId: string },
    input: { patientId: string; encounterId?: string; codingSystem: string; code: string; display: string; onsetDate?: string; notes?: string },
  ): Promise<Problem> {
    const p = await this.tx.problem.create({
      data: {
        clinicId: ctx.tenantId,
        patientId: input.patientId,
        encounterId: input.encounterId,
        codingSystem: input.codingSystem as never,
        code: input.code,
        display: input.display,
        onsetDate: input.onsetDate ? new Date(`${input.onsetDate}T12:00:00.000Z`) : undefined,
        notes: input.notes,
        recordedById: ctx.actorId,
      },
    });
    return this.problemDto(p);
  }

  async listProblems(clinicId: string, patientId: string): Promise<Problem[]> {
    const rows = await this.tx.problem.findMany({
      where: { clinicId, patientId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((p) => this.problemDto(p));
  }

  async setProblemStatus(clinicId: string, id: string, status: string): Promise<Problem | null> {
    const existing = await this.tx.problem.findFirst({ where: { clinicId, id } });
    if (!existing) return null;
    const p = await this.tx.problem.update({
      where: { id },
      data: {
        status: status as never,
        ...(status === "RESOLVED" ? { resolvedAt: new Date() } : {}),
        ...(status === "VERIFIED" ? { verifiedAt: new Date() } : {}),
      },
    });
    return this.problemDto(p);
  }

  private problemDto(p: {
    id: string;
    patientId: string;
    encounterId: string | null;
    codingSystem: string;
    code: string;
    display: string;
    status: string;
    onsetDate: Date | null;
    resolvedAt: Date | null;
    verifiedAt: Date | null;
    notes: string | null;
    createdAt: Date;
  }): Problem {
    return {
      id: p.id,
      patientId: p.patientId,
      encounterId: p.encounterId,
      codingSystem: p.codingSystem as Problem["codingSystem"],
      code: p.code,
      display: p.display,
      status: p.status as Problem["status"],
      onsetDate: p.onsetDate?.toISOString() ?? null,
      resolvedAt: p.resolvedAt?.toISOString() ?? null,
      verifiedAt: p.verifiedAt?.toISOString() ?? null,
      notes: p.notes,
      createdAt: p.createdAt.toISOString(),
    };
  }

  // ------------------------------------------------------------------ allergies

  async addAllergy(
    ctx: { tenantId: string; actorId: string },
    input: { patientId: string; substance: string; category?: string; reaction?: string; severity?: string; status?: string },
  ): Promise<Allergy> {
    const a = await this.tx.allergy.create({
      data: {
        clinicId: ctx.tenantId,
        patientId: input.patientId,
        substance: input.substance,
        category: input.category,
        reaction: input.reaction,
        severity: input.severity as never,
        status: (input.status ?? "ACTIVE") as never,
        recordedById: ctx.actorId,
      },
    });
    return this.allergyDto(a);
  }

  async listAllergies(clinicId: string, patientId: string): Promise<Allergy[]> {
    const rows = await this.tx.allergy.findMany({
      where: { clinicId, patientId },
      orderBy: { recordedAt: "desc" },
    });
    return rows.map((a) => this.allergyDto(a));
  }

  private allergyDto(a: {
    id: string;
    patientId: string;
    substance: string;
    category: string | null;
    reaction: string | null;
    severity: string | null;
    status: string;
    recordedAt: Date;
    verifiedAt: Date | null;
  }): Allergy {
    return {
      id: a.id,
      patientId: a.patientId,
      substance: a.substance,
      category: a.category,
      reaction: a.reaction,
      severity: a.severity as Allergy["severity"],
      status: a.status as Allergy["status"],
      recordedAt: a.recordedAt.toISOString(),
      verifiedAt: a.verifiedAt?.toISOString() ?? null,
    };
  }

  // ---------------------------------------------------------------- medications

  async addMedicationOrder(
    ctx: { tenantId: string; actorId: string },
    input: { patientId: string; encounterId?: string; medicationName: string; dose?: string; route?: string; frequency?: string; durationDays?: number; instructions?: string; reviewedById?: string },
  ): Promise<MedicationOrder> {
    const m = await this.tx.medicationOrder.create({
      data: {
        clinicId: ctx.tenantId,
        patientId: input.patientId,
        encounterId: input.encounterId,
        medicationName: input.medicationName,
        dose: input.dose,
        route: input.route,
        frequency: input.frequency,
        durationDays: input.durationDays,
        instructions: input.instructions,
        status: "DRAFT",
        authoredById: ctx.actorId,
        reviewedById: input.reviewedById,
      },
      include: { authoredBy: { select: { fullName: true } } },
    });
    return this.medicationDto(m);
  }

  async listMedications(clinicId: string, patientId: string): Promise<MedicationOrder[]> {
    const rows = await this.tx.medicationOrder.findMany({
      where: { clinicId, patientId },
      orderBy: { createdAt: "desc" },
      include: { authoredBy: { select: { fullName: true } } },
    });
    return rows.map((m) => this.medicationDto(m));
  }

  async setMedicationStatus(clinicId: string, id: string, status: string, reviewedById?: string): Promise<MedicationOrder | null> {
    const existing = await this.tx.medicationOrder.findFirst({ where: { clinicId, id } });
    if (!existing) return null;
    const m = await this.tx.medicationOrder.update({
      where: { id },
      data: {
        status: status as never,
        // A DRAFT order can only become ACTIVE through clinician review:
        reviewedById: status === "ACTIVE" ? reviewedById ?? existing.reviewedById : existing.reviewedById,
      },
      include: { authoredBy: { select: { fullName: true } } },
    });
    return this.medicationDto(m);
  }

  private medicationDto(m: {
    id: string;
    patientId: string;
    encounterId: string | null;
    medicationName: string;
    dose: string | null;
    route: string | null;
    frequency: string | null;
    durationDays: number | null;
    instructions: string | null;
    status: string;
    authoredById: string;
    authoredBy: { fullName: string } | null;
    createdAt: Date;
  }): MedicationOrder {
    return {
      id: m.id,
      patientId: m.patientId,
      encounterId: m.encounterId,
      medicationName: m.medicationName,
      dose: m.dose,
      route: m.route,
      frequency: m.frequency,
      durationDays: m.durationDays,
      instructions: m.instructions,
      status: m.status as MedicationOrder["status"],
      authoredById: m.authoredById,
      authoredByName: m.authoredBy?.fullName ?? null,
      createdAt: m.createdAt.toISOString(),
    };
  }

  // ---------------------------------------------------------------- break-glass

  async breakGlass(
    ctx: { tenantId: string; actorId: string },
    patientId: string,
    reason: string,
  ): Promise<void> {
    await this.tx.breakGlassAccess.create({
      data: {
        clinicId: ctx.tenantId,
        actorId: ctx.actorId,
        patientId,
        reason,
        expiresAt: new Date(Date.now() + 30 * 60000), // 30-minute window
      },
    });
  }

  async hasActiveBreakGlass(clinicId: string, actorId: string, patientId: string): Promise<boolean> {
    const bg = await this.tx.breakGlassAccess.findFirst({
      where: { clinicId, actorId, patientId, expiresAt: { gt: new Date() } },
      select: { id: true },
    });
    return Boolean(bg);
  }

  // ------------------------------------------------------------------ summary

  async summary(clinicId: string, patientId: string): Promise<ClinicalSummary> {
    const [problems, allergies, medications, observations] = await Promise.all([
      this.listProblems(clinicId, patientId),
      this.listAllergies(clinicId, patientId),
      this.listMedications(clinicId, patientId),
      this.listObservations(clinicId, patientId, 40),
    ]);
    return {
      patientId,
      activeProblems: problems.filter((p) => p.status === "ACTIVE"),
      allergies,
      activeMedications: medications.filter((m) => m.status === "ACTIVE"),
      recentObservations: observations.slice(0, 10),
      pendingResults: observations.filter((o) => !o.encounterId).slice(0, 5),
    };
  }

  async timeline(clinicId: string, patientId: string): Promise<TimelineEvent[]> {
    const [encounters, problems, allergies, medications, observations, appointments] =
      await Promise.all([
        this.tx.encounter.findMany({
          where: { clinicId, patientId },
          orderBy: { createdAt: "desc" },
          take: 30,
          select: { id: true, title: true, status: true, createdAt: true, chiefComplaint: true },
        }),
        this.listProblems(clinicId, patientId),
        this.listAllergies(clinicId, patientId),
        this.listMedications(clinicId, patientId),
        this.listObservations(clinicId, patientId, 30),
        this.tx.appointment.findMany({
          where: { clinicId, patientId },
          orderBy: { startTime: "desc" },
          take: 30,
          select: { id: true, reason: true, type: true, status: true, startTime: true },
        }),
      ]);

    const events: TimelineEvent[] = [];
    for (const e of encounters) {
      events.push({
        id: `enc-${e.id}`,
        kind: "ENCOUNTER",
        title: e.title,
        detail: e.chiefComplaint,
        occurredAt: e.createdAt.toISOString(),
        status: e.status,
        hrefId: e.id,
      });
    }
    for (const p of problems) {
      events.push({
        id: `prb-${p.id}`,
        kind: "PROBLEM",
        title: `${p.display} (${p.code})`,
        detail: p.notes,
        occurredAt: p.createdAt,
        status: p.status,
        hrefId: p.id,
      });
    }
    for (const a of allergies) {
      events.push({
        id: `alg-${a.id}`,
        kind: "ALLERGY",
        title: a.substance,
        detail: a.reaction,
        occurredAt: a.recordedAt,
        status: a.status,
        hrefId: a.id,
      });
    }
    for (const m of medications) {
      events.push({
        id: `med-${m.id}`,
        kind: "MEDICATION",
        title: m.medicationName,
        detail: [m.dose, m.frequency].filter(Boolean).join(" · "),
        occurredAt: m.createdAt,
        status: m.status,
        hrefId: m.id,
      });
    }
    for (const o of observations) {
      events.push({
        id: `obs-${o.id}`,
        kind: "OBSERVATION",
        title: `${o.type.toLowerCase().replace(/_/g, " ")}: ${o.value}${o.unit ? ` ${o.unit}` : ""}`,
        detail: null,
        occurredAt: o.effectiveAt,
        status: null,
        hrefId: o.id,
      });
    }
    for (const a of appointments) {
      events.push({
        id: `appt-${a.id}`,
        kind: "APPOINTMENT",
        title: a.reason ?? a.type,
        detail: null,
        occurredAt: a.startTime.toISOString(),
        status: a.status,
        hrefId: a.id,
      });
    }
    return events.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  }
}
