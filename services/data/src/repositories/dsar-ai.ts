/**
 * DSAR + AI repositories.
 */
import crypto from "crypto";
import type { Tx } from "../client.js";
import { decryptPHI } from "../crypto.js";
import type {
  AiDraft,
  DsarRequest,
  PatientExportBundle,
  PromptTemplate,
  ScribeDraftContent,
  ChatMessage,
} from "@medical/contracts";

export class DsarRepository {
  constructor(private tx: Tx) {}

  private toDto(d: {
    id: string;
    patientId: string;
    type: string;
    status: string;
    details: string | null;
    dueAt: Date | null;
    fulfilledAt: Date | null;
    decisionNote: string | null;
    requestedById: string;
    createdAt: Date;
    patient: { fullName: string };
    requestedBy: { fullName: string } | null;
  }): DsarRequest {
    return {
      id: d.id,
      patientId: d.patientId,
      patientName: d.patient.fullName,
      type: d.type as DsarRequest["type"],
      status: d.status as DsarRequest["status"],
      details: d.details,
      dueAt: d.dueAt?.toISOString() ?? null,
      fulfilledAt: d.fulfilledAt?.toISOString() ?? null,
      decisionNote: d.decisionNote,
      createdById: d.requestedById,
      createdByName: d.requestedBy?.fullName ?? null,
      createdAt: d.createdAt.toISOString(),
    };
  }

  async list(clinicId: string, status?: string): Promise<DsarRequest[]> {
    const rows = await this.tx.dsarRequest.findMany({
      where: { clinicId, ...(status ? { status: status as never } : {}) },
      orderBy: { createdAt: "desc" },
      include: { patient: { select: { fullName: true } }, requestedBy: { select: { fullName: true } } },
    });
    return rows.map((r) => this.toDto(r));
  }

  async create(
    ctx: { tenantId: string; actorId: string },
    input: { patientId: string; type: string; details?: string; dueInDays: number },
  ): Promise<DsarRequest> {
    const d = await this.tx.dsarRequest.create({
      data: {
        clinicId: ctx.tenantId,
        patientId: input.patientId,
        requestedById: ctx.actorId,
        type: input.type as never,
        details: input.details,
        dueAt: new Date(Date.now() + input.dueInDays * 24 * 3600 * 1000),
      },
      include: { patient: { select: { fullName: true } }, requestedBy: { select: { fullName: true } } },
    });
    return this.toDto(d);
  }

  async setStatus(
    clinicId: string,
    id: string,
    status: "IN_PROGRESS" | "FULFILLED" | "REJECTED",
    decisionNote?: string,
  ): Promise<DsarRequest | null> {
    const existing = await this.tx.dsarRequest.findFirst({ where: { clinicId, id } });
    if (!existing) return null;
    const d = await this.tx.dsarRequest.update({
      where: { id },
      data: {
        status,
        decisionNote,
        ...(status === "FULFILLED" ? { fulfilledAt: new Date() } : {}),
      },
      include: { patient: { select: { fullName: true } }, requestedBy: { select: { fullName: true } } },
    });
    return this.toDto(d);
  }

  /**
   * Full subject export (DSAR-001): everything the clinic holds about one
   * patient, assembled inside the tenant transaction, PHI decrypted.
   */
  async exportBundle(clinicId: string, patientId: string): Promise<PatientExportBundle | null> {
    const patient = await this.tx.patient.findFirst({
      where: { clinicId, id: patientId },
      include: {
        identifiers: true,
        consents: true,
        primaryDoctor: { select: { fullName: true } },
      },
    });
    if (!patient) return null;

    const [encounters, versions, problems, allergies, medications, observations, appointments, invoices, payments, threads, audit] =
      await Promise.all([
        this.tx.encounter.findMany({ where: { clinicId, patientId } }),
        this.tx.encounterVersion.findMany({ where: { clinicId, encounter: { patientId } } }),
        this.tx.problem.findMany({ where: { clinicId, patientId } }),
        this.tx.allergy.findMany({ where: { clinicId, patientId } }),
        this.tx.medicationOrder.findMany({ where: { clinicId, patientId } }),
        this.tx.observation.findMany({ where: { clinicId, patientId } }),
        this.tx.appointment.findMany({ where: { clinicId, patientId } }),
        this.tx.invoice.findMany({ where: { clinicId, patientId }, include: { items: true } }),
        this.tx.payment.findMany({ where: { clinicId, invoice: { patientId } } }),
        this.tx.thread.findMany({ where: { clinicId, patientId }, include: { messages: true } }),
        this.tx.auditLog.findMany({ where: { clinicId, subjectPatientId: patientId }, orderBy: { seq: "asc" } }),
      ]);

    const clinic = await this.tx.clinic.findUnique({ where: { id: clinicId } });

    return {
      generatedAt: new Date().toISOString(),
      clinic: { id: clinicId, name: clinic?.name ?? "" },
      patient: {
        internalRef: patient.internalRef,
        fullName: patient.fullName,
        birthDate: decryptPHI(patient.birthDateEnc),
        sex: patient.sex,
        phone: decryptPHI(patient.phoneEnc),
        email: decryptPHI(patient.emailEnc),
        address: decryptPHI(patient.addressEnc),
        status: patient.status,
        primaryDoctor: patient.primaryDoctor?.fullName ?? null,
        createdAt: patient.createdAt.toISOString(),
      },
      identifiers: patient.identifiers.map((i) => ({
        type: i.type,
        value: decryptPHI(i.valueEnc),
        isPrimary: i.isPrimary,
      })),
      consents: patient.consents.map((c) => ({
        type: c.type,
        status: c.status,
        grantedAt: c.grantedAt?.toISOString() ?? null,
        note: c.note,
      })),
      encounters: encounters.map((e) => ({
        id: e.id,
        title: e.title,
        chiefComplaint: e.chiefComplaint,
        observations: e.observations,
        plan: e.plan,
        status: e.status,
        doctorId: e.doctorId,
        createdAt: e.createdAt.toISOString(),
      })),
      encounterVersions: versions.map((v) => ({
        encounterId: v.encounterId,
        version: v.version,
        snapshot: v.snapshot,
        changeReason: v.changeReason,
        createdAt: v.createdAt.toISOString(),
      })),
      problems: problems.map((p) => ({
        codingSystem: p.codingSystem,
        code: p.code,
        display: p.display,
        status: p.status,
        onsetDate: p.onsetDate?.toISOString() ?? null,
      })),
      allergies: allergies.map((a) => ({
        substance: a.substance,
        reaction: a.reaction,
        severity: a.severity,
        status: a.status,
        recordedAt: a.recordedAt.toISOString(),
      })),
      medications: medications.map((m) => ({
        medicationName: m.medicationName,
        dose: m.dose,
        frequency: m.frequency,
        status: m.status,
        createdAt: m.createdAt.toISOString(),
      })),
      observations: observations.map((o) => ({
        type: o.type,
        loincCode: o.loincCode,
        value: o.value,
        unit: o.unit,
        effectiveAt: o.effectiveAt.toISOString(),
      })),
      appointments: appointments.map((a) => ({
        type: a.type,
        startTime: a.startTime.toISOString(),
        endTime: a.endTime.toISOString(),
        status: a.status,
        reason: a.reason,
      })),
      invoices: invoices.map((i) => ({
        number: i.number,
        status: i.status,
        total: i.total,
        issuedAt: i.issuedAt?.toISOString() ?? null,
        items: i.items,
      })),
      payments: payments.map((p) => ({
        amount: p.amount,
        method: p.method,
        receivedAt: p.receivedAt.toISOString(),
      })),
      threads: threads.map((t) => ({
        subject: t.subject,
        category: t.category,
        messages: t.messages.map((m) => ({ senderId: m.senderId, body: m.body, createdAt: m.createdAt.toISOString() })),
      })),
      auditEvents: audit.map((a) => ({
        seq: a.seq,
        action: a.action,
        actorId: a.actorId,
        at: a.createdAt.toISOString(),
      })),
    };
  }
}

export class AiRepository {
  constructor(private tx: Tx) {}

  async activePrompt(clinicId: string, name: string): Promise<PromptTemplate | null> {
    const p = await this.tx.promptTemplate.findFirst({
      where: { clinicId, name, isActive: true },
      orderBy: { version: "desc" },
    });
    return p ? this.promptDto(p) : null;
  }

  async upsertPrompt(
    clinicId: string,
    input: { name: string; template: string; purpose?: string },
  ): Promise<PromptTemplate> {
    const latest = await this.tx.promptTemplate.findFirst({
      where: { clinicId, name: input.name },
      orderBy: { version: "desc" },
    });
    // New revisions never overwrite history: create a new version and flip
    // the previous one inactive (auditable prompt registry, AI-001).
    if (latest) {
      await this.tx.promptTemplate.update({ where: { id: latest.id }, data: { isActive: false } });
    }
    const p = await this.tx.promptTemplate.create({
      data: {
        clinicId,
        name: input.name,
        version: (latest?.version ?? 0) + 1,
        purpose: input.purpose ?? latest?.purpose ?? "",
        template: input.template,
        isActive: true,
      },
    });
    return this.promptDto(p);
  }

  async listPrompts(clinicId: string): Promise<PromptTemplate[]> {
    const rows = await this.tx.promptTemplate.findMany({
      where: { clinicId, isActive: true },
      orderBy: { name: "asc" },
    });
    return rows.map((p) => this.promptDto(p));
  }

  private promptDto(p: {
    id: string;
    name: string;
    version: number;
    purpose: string;
    template: string;
    isActive: boolean;
    updatedAt: Date;
  }): PromptTemplate {
    return {
      id: p.id,
      name: p.name,
      version: p.version,
      purpose: p.purpose,
      template: p.template,
      isActive: p.isActive,
      updatedAt: p.updatedAt.toISOString(),
    };
  }

  async saveDraft(
    ctx: { tenantId: string; actorId: string },
    input: { encounterId?: string; patientId?: string; type: "SCRIBE_NOTE" | "CHAT_REPLY"; content: ScribeDraftContent; model: string; promptVersion: string },
  ): Promise<AiDraft> {
    const d = await this.tx.aiDraft.create({
      data: {
        clinicId: ctx.tenantId,
        encounterId: input.encounterId,
        patientId: input.patientId,
        authorId: ctx.actorId,
        type: input.type,
        content: input.content,
        model: input.model,
        promptVersion: input.promptVersion,
        reviewState: "PENDING",
      },
    });
    return this.draftDto(d);
  }

  async findDraft(clinicId: string, id: string): Promise<AiDraft | null> {
    const d = await this.tx.aiDraft.findFirst({ where: { clinicId, id } });
    return d ? this.draftDto(d) : null;
  }

  async setDraftState(
    ctx: { tenantId: string; actorId: string },
    id: string,
    state: "INSERTED" | "DISCARDED",
  ): Promise<AiDraft | null> {
    const existing = await this.tx.aiDraft.findFirst({ where: { clinicId: ctx.tenantId, id } });
    if (!existing || existing.reviewState !== "PENDING") return null;
    const d = await this.tx.aiDraft.update({
      where: { id },
      data: { reviewState: state, reviewedById: ctx.actorId },
    });
    return this.draftDto(d);
  }

  private draftDto(d: {
    id: string;
    encounterId: string | null;
    patientId: string | null;
    type: string;
    content: unknown;
    model: string;
    promptVersion: string;
    reviewState: string;
    createdAt: Date;
  }): AiDraft {
    return {
      id: d.id,
      encounterId: d.encounterId,
      patientId: d.patientId,
      type: d.type as AiDraft["type"],
      content: d.content as ScribeDraftContent,
      model: d.model,
      promptVersion: d.promptVersion,
      reviewState: d.reviewState as AiDraft["reviewState"],
      createdAt: d.createdAt.toISOString(),
    };
  }

  async createConversation(ctx: { tenantId: string; actorId: string }, title?: string): Promise<string> {
    const c = await this.tx.aiConversation.create({
      data: { clinicId: ctx.tenantId, userId: ctx.actorId, title },
    });
    return c.id;
  }

  async listMessages(clinicId: string, conversationId: string, userId: string): Promise<ChatMessage[]> {
    const convo = await this.tx.aiConversation.findFirst({
      where: { clinicId, id: conversationId, userId },
    });
    if (!convo) return [];
    const rows = await this.tx.aiMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
      take: 200,
    });
    return rows.map((m) => ({
      id: m.id,
      role: m.role as ChatMessage["role"],
      content: m.content,
      createdAt: m.createdAt.toISOString(),
    }));
  }

  async appendMessage(
    ctx: { tenantId: string; actorId: string },
    conversationId: string,
    role: "USER" | "ASSISTANT",
    content: string,
    meta?: { redactionApplied?: boolean; model?: string; promptVersion?: string },
  ): Promise<void> {
    const convo = await this.tx.aiConversation.findFirst({
      where: { clinicId: ctx.tenantId, id: conversationId, userId: ctx.actorId },
      select: { id: true },
    });
    if (!convo) throw new Error("Conversation not found");
    await this.tx.aiMessage.create({
      data: {
        clinicId: ctx.tenantId,
        conversationId,
        role,
        content,
        redactionApplied: meta?.redactionApplied ?? false,
        model: meta?.model,
        promptVersion: meta?.promptVersion,
      },
    });
    await this.tx.aiConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
  }
}

export const randomId = (): string => crypto.randomUUID();
