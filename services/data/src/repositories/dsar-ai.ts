/**
 * DSAR + AI repositories.
 *
 * DSAR release is a governed, dual-control flow (PRIV-001):
 *   prepare (encrypted artifact, 24h) -> approve (approver != requester)
 *   -> issue one-time download token (15 min) -> single-use audited download.
 * Artifacts are AES-256-GCM ciphertext at rest; download tokens are stored
 * hash-only and consumed with a compare-and-set update.
 */
import crypto from "crypto";
import type { Tx } from "../client.js";
import { decryptPHI } from "../crypto.js";
import { DomainError } from "@medical/domain";
import type {
  AiDraft,
  DsarRequest,
  PatientExportBundle,
  PromptTemplate,
  ScribeDraftContent,
  ChatMessage,
} from "@medical/contracts";

export const DSAR_ARTIFACT_TTL_MS = 24 * 3600 * 1000; // 24 hours
export const DSAR_DOWNLOAD_TTL_MS = 15 * 60 * 1000; // 15 minutes

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
    preparedAt: Date | null;
    artifactExpiresAt: Date | null;
    approvedAt: Date | null;
    downloadIssuedAt: Date | null;
    downloadExpiresAt: Date | null;
    downloadedAt: Date | null;
    patient: { fullName: string };
    requestedBy: { fullName: string } | null;
    approvedBy: { fullName: string } | null;
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
      preparedAt: d.preparedAt?.toISOString() ?? null,
      artifactExpiresAt: d.artifactExpiresAt?.toISOString() ?? null,
      approvedAt: d.approvedAt?.toISOString() ?? null,
      approvedByName: d.approvedBy?.fullName ?? null,
      downloadIssuedAt: d.downloadIssuedAt?.toISOString() ?? null,
      downloadExpiresAt: d.downloadExpiresAt?.toISOString() ?? null,
      downloadedAt: d.downloadedAt?.toISOString() ?? null,
    };
  }

  async list(clinicId: string, status?: string): Promise<DsarRequest[]> {
    const rows = await this.tx.dsarRequest.findMany({
      where: { clinicId, ...(status ? { status: status as never } : {}) },
      orderBy: { createdAt: "desc" },
      include: {
        patient: { select: { fullName: true } },
        requestedBy: { select: { fullName: true } },
        approvedBy: { select: { fullName: true } },
      },
    });
    return rows.map((r) => this.toDto(r));
  }

  async findById(clinicId: string, id: string): Promise<DsarRequest | null> {
    const d = await this.tx.dsarRequest.findFirst({
      where: { clinicId, id },
      include: {
        patient: { select: { fullName: true } },
        requestedBy: { select: { fullName: true } },
        approvedBy: { select: { fullName: true } },
      },
    });
    return d ? this.toDto(d) : null;
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
      include: {
        patient: { select: { fullName: true } },
        requestedBy: { select: { fullName: true } },
        approvedBy: { select: { fullName: true } },
      },
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
      include: {
        patient: { select: { fullName: true } },
        requestedBy: { select: { fullName: true } },
        approvedBy: { select: { fullName: true } },
      },
    });
    return this.toDto(d);
  }

  /**
   * Persist the encrypted export artifact and stamp the request lifecycle.
   * The ciphertext is stored as-is; keys never leave the server process.
   */
  async saveArtifact(
    ctx: { tenantId: string; actorId: string },
    requestId: string,
    ciphertext: string,
    byteSize: number,
    contentHash: string,
  ): Promise<DsarRequest | null> {
    const request = await this.tx.dsarRequest.findFirst({ where: { clinicId: ctx.tenantId, id: requestId } });
    if (!request) return null;
    const expiresAt = new Date(Date.now() + DSAR_ARTIFACT_TTL_MS);
    await this.tx.dsarArtifact.create({
      data: {
        clinicId: ctx.tenantId,
        requestId,
        ciphertext,
        byteSize,
        contentHash,
        preparedById: ctx.actorId,
        expiresAt,
      },
    });
    const d = await this.tx.dsarRequest.update({
      where: { id: requestId },
      data: {
        preparedById: ctx.actorId,
        preparedAt: new Date(),
        artifactExpiresAt: expiresAt,
        approvedAt: null,
        approvedById: null,
        downloadIssuedAt: null,
        downloadExpiresAt: null,
        downloadedAt: null,
      },
      include: {
        patient: { select: { fullName: true } },
        requestedBy: { select: { fullName: true } },
        approvedBy: { select: { fullName: true } },
      },
    });
    return this.toDto(d);
  }

  /** Latest non-expired artifact for a request, or null. */
  async activeArtifact(clinicId: string, requestId: string) {
    return this.tx.dsarArtifact.findFirst({
      where: { clinicId, requestId, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
  }

  /** Dual-control approval. Returns null when the request does not exist. */
  async approve(
    ctx: { tenantId: string; actorId: string },
    requestId: string,
  ): Promise<DsarRequest | null> {
    const request = await this.tx.dsarRequest.findFirst({ where: { clinicId: ctx.tenantId, id: requestId } });
    if (!request) return null;
    const d = await this.tx.dsarRequest.update({
      where: { id: requestId },
      data: { approvedById: ctx.actorId, approvedAt: new Date() },
      include: {
        patient: { select: { fullName: true } },
        requestedBy: { select: { fullName: true } },
        approvedBy: { select: { fullName: true } },
      },
    });
    return this.toDto(d);
  }

  /** Issue a one-time download token; only its SHA-256 hash is persisted. */
  async issueDownloadToken(
    ctx: { tenantId: string; actorId: string },
    requestId: string,
  ): Promise<{ token: string; expiresAt: Date }> {
    const token = crypto.randomBytes(32).toString("base64url");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + DSAR_DOWNLOAD_TTL_MS);
    await this.tx.dsarDownloadToken.create({
      data: {
        requestId,
        clinicId: ctx.tenantId,
        tokenHash,
        issuedById: ctx.actorId,
        expiresAt,
      },
    });
    await this.tx.dsarRequest.update({
      where: { id: requestId },
      data: { downloadIssuedAt: new Date(), downloadExpiresAt: expiresAt, downloadedAt: null },
    });
    return { token, expiresAt };
  }

  /**
   * Consume a download token inside the tenant transaction. The CAS update
   * makes replay impossible: only the first consumer wins, everything else
   * returns null.
   */
  async consumeDownloadToken(
    ctx: { tenantId: string; actorId: string },
    requestId: string,
    token: string,
  ): Promise<{ ciphertext: string; contentHash: string } | null> {
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const row = await this.tx.dsarDownloadToken.findFirst({
      where: { requestId, tokenHash },
    });
    if (!row || row.consumedAt || row.expiresAt < new Date()) return null;
    const claimed = await this.tx.dsarDownloadToken.updateMany({
      where: { id: row.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (claimed.count !== 1) return null;
    const artifact = await this.tx.dsarArtifact.findFirst({
      where: { clinicId: ctx.tenantId, requestId },
      orderBy: { createdAt: "desc" },
    });
    if (!artifact) return null;
    await this.tx.dsarRequest.update({
      where: { id: requestId },
      data: { downloadedAt: new Date() },
    });
    return { ciphertext: artifact.ciphertext, contentHash: artifact.contentHash };
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

    const [encounters, versions, problems, allergies, medications, observations, appointments, invoices, payments, threads, careTeam, aiDrafts, breakGlass, dsars, audit] =
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
        this.tx.careTeamMembership.findMany({ where: { clinicId, patientId }, include: { user: { select: { fullName: true, role: true } } } }),
        this.tx.aiDraft.findMany({ where: { clinicId, patientId } }),
        this.tx.breakGlassAccess.findMany({ where: { clinicId, patientId } }),
        this.tx.dsarRequest.findMany({ where: { clinicId, patientId } }),
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
      careTeam: careTeam.map((m) => ({
        memberRole: m.memberRole,
        userName: m.user.fullName,
        userRole: m.user.role,
        startedAt: m.startedAt.toISOString(),
        endedAt: m.endedAt?.toISOString() ?? null,
      })),
      aiDrafts: aiDrafts.map((d) => ({
        type: d.type,
        content: d.content,
        model: d.model,
        promptVersion: d.promptVersion,
        reviewState: d.reviewState,
        createdAt: d.createdAt.toISOString(),
      })),
      breakGlassEvents: breakGlass.map((b) => ({
        reason: b.reason,
        grantedAt: b.grantedAt.toISOString(),
        expiresAt: b.expiresAt.toISOString(),
      })),
      dsarRequests: dsars.map((d) => ({
        id: d.id,
        type: d.type,
        status: d.status,
        details: d.details,
        decisionNote: d.decisionNote,
        createdAt: d.createdAt.toISOString(),
        fulfilledAt: d.fulfilledAt?.toISOString() ?? null,
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

  private promptDto(p: {
    id: string;
    name: string;
    version: number;
    purpose: string;
    template: string;
    state: string;
    submittedById: string | null;
    approvedById: string | null;
    approvedAt: Date | null;
    updatedAt: Date;
  }): PromptTemplate {
    return {
      id: p.id,
      name: p.name,
      version: p.version,
      purpose: p.purpose,
      template: p.template,
      state: p.state as PromptTemplate["state"],
      submittedById: p.submittedById,
      approvedById: p.approvedById,
      approvedAt: p.approvedAt?.toISOString() ?? null,
      updatedAt: p.updatedAt.toISOString(),
    };
  }

  private async promptById(clinicId: string, id: string) {
    const p = await this.tx.promptTemplate.findFirst({ where: { clinicId, id } });
    return p;
  }

  /** The version currently serving traffic (state ACTIVE). */
  async activePrompt(clinicId: string, name: string): Promise<PromptTemplate | null> {
    const p = await this.tx.promptTemplate.findFirst({
      where: { clinicId, name, state: "ACTIVE" },
      orderBy: { version: "desc" },
    });
    return p ? this.promptDto(p) : null;
  }

  /**
    * Creates a new DRAFT version. Existing versions - including the active
    * one - are never mutated (AI-003): every change is a new version.
    */
  async upsertPrompt(
    clinicId: string,
    input: { name: string; template: string; purpose?: string },
  ): Promise<PromptTemplate> {
    const latest = await this.tx.promptTemplate.findFirst({
      where: { clinicId, name: input.name },
      orderBy: { version: "desc" },
    });
    const p = await this.tx.promptTemplate.create({
      data: {
        clinicId,
        name: input.name,
        version: (latest?.version ?? 0) + 1,
        purpose: input.purpose ?? latest?.purpose ?? "",
        template: input.template,
        state: "DRAFT",
      },
    });
    return this.promptDto(p);
  }

  /** DRAFT -> PENDING_APPROVAL, recorded against the submitting author. */
  async submitPrompt(clinicId: string, id: string, actorId: string): Promise<PromptTemplate | null> {
    const p = await this.promptById(clinicId, id);
    if (!p || p.state !== "DRAFT") return null;
    const updated = await this.tx.promptTemplate.update({
      where: { id },
      data: { state: "PENDING_APPROVAL", submittedById: actorId },
    });
    return this.promptDto(updated);
  }

  /**
    * PENDING_APPROVAL -> ACTIVE under dual control: the approver must
    * differ from the submitter. The previous ACTIVE version retires in the
    * same transaction so exactly one version serves traffic per name.
    */
  async approvePrompt(clinicId: string, id: string, approverId: string): Promise<PromptTemplate | null> {
    const p = await this.promptById(clinicId, id);
    if (!p || p.state !== "PENDING_APPROVAL") return null;
    if (p.submittedById && p.submittedById === approverId) {
      throw new DomainError(
        "UNPROCESSABLE",
        "A prompt version must be approved by someone other than its author",
      );
    }
    await this.tx.promptTemplate.updateMany({
      where: { clinicId, name: p.name, state: "ACTIVE" },
      data: { state: "RETIRED", isActive: false },
    });
    const updated = await this.tx.promptTemplate.update({
      where: { id },
      data: { state: "ACTIVE", isActive: true, approvedById: approverId, approvedAt: new Date() },
    });
    return this.promptDto(updated);
  }

  /** ACTIVE -> RETIRED; the name falls back to defaults until re-activated. */
  async retirePrompt(clinicId: string, id: string): Promise<PromptTemplate | null> {
    const p = await this.promptById(clinicId, id);
    if (!p || p.state !== "ACTIVE") return null;
    const updated = await this.tx.promptTemplate.update({
      where: { id },
      data: { state: "RETIRED", isActive: false },
    });
    return this.promptDto(updated);
  }

  /** Full version history for the registry console (states included). */
  async listPrompts(clinicId: string): Promise<PromptTemplate[]> {
    const rows = await this.tx.promptTemplate.findMany({
      where: { clinicId },
      orderBy: [{ name: "asc" }, { version: "desc" }],
    });
    return rows.map((p) => this.promptDto(p));
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
