/**
 * Messaging repository: secure inbox threads, messages and notifications.
 */
import type { Tx } from "../client.js";
import { DomainError } from "@medical/domain";
import type { Message, NotificationItem, ThreadSummary } from "@medical/contracts";

export class MessagingRepository {
  constructor(private tx: Tx) {}

  async listThreads(clinicId: string, userId: string): Promise<ThreadSummary[]> {
    const rows = await this.tx.thread.findMany({
      where: { clinicId, participants: { some: { userId } } },
      orderBy: { lastMessageAt: "desc" },
      include: {
        patient: { select: { fullName: true } },
        createdBy: { select: { id: true, fullName: true } },
        participants: { include: { user: { select: { id: true, fullName: true } } } },
        messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true } },
      },
    });

    const mine = new Map(
      rows.map((t) => {
        const p = t.participants.find((x) => x.userId === userId);
        return [t.id, p?.lastReadAt ?? null];
      }),
    );

    return rows.map((t) => ({
      id: t.id,
      subject: t.subject,
      category: t.category as ThreadSummary["category"],
      patientId: t.patientId,
      patientName: t.patient?.fullName ?? null,
      createdById: t.createdBy.id,
      createdByName: t.createdBy.fullName,
      lastMessageAt: t.lastMessageAt?.toISOString() ?? null,
      lastMessagePreview: t.messages[0]?.body.slice(0, 120) ?? null,
      unread: Boolean(
        t.lastMessageAt && (!mine.get(t.id) || t.lastMessageAt > (mine.get(t.id) as Date)),
      ),
      participants: t.participants.map((p) => ({ id: p.user.id, fullName: p.user.fullName })),
    }));
  }

  async findThread(clinicId: string, threadId: string, userId: string): Promise<ThreadSummary | null> {
    const t = await this.tx.thread.findFirst({
      where: { clinicId, id: threadId, participants: { some: { userId } } },
      include: {
        patient: { select: { fullName: true } },
        createdBy: { select: { id: true, fullName: true } },
        participants: { include: { user: { select: { id: true, fullName: true } } } },
        messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true } },
      },
    });
    if (!t) return null;
    const mine = t.participants.find((p) => p.userId === userId);
    return {
      id: t.id,
      subject: t.subject,
      category: t.category as ThreadSummary["category"],
      patientId: t.patientId,
      patientName: t.patient?.fullName ?? null,
      createdById: t.createdBy.id,
      createdByName: t.createdBy.fullName,
      lastMessageAt: t.lastMessageAt?.toISOString() ?? null,
      lastMessagePreview: t.messages[0]?.body.slice(0, 120) ?? null,
      unread: Boolean(
        t.lastMessageAt && (!mine?.lastReadAt || t.lastMessageAt > mine.lastReadAt),
      ),
      participants: t.participants.map((p) => ({ id: p.user.id, fullName: p.user.fullName })),
    };
  }

  /**
   * Participant validation (COM-001): every participant must belong to this
   * clinic, be active, and be eligible for the conversation. Portal users
   * join only an explicit patient-communication thread about their own
   * record. For patient-linked threads, staff need a treating relationship
   * or the patient's COMMUNICATION consent. The whole set is rejected when
   * any member fails - no partial conversations are ever created.
   */
  private async assertValidParticipants(
    clinicId: string,
    participantIds: string[],
    input: { patientId?: string; category: string },
  ): Promise<void> {
    if (participantIds.length === 0) return;
    const users = await this.tx.user.findMany({
      where: { clinicId, id: { in: participantIds } },
      select: { id: true, isActive: true, role: true, patientId: true },
    });
    const found = new Map(users.map((u) => [u.id, u]));
    for (const pid of participantIds) {
      const user = found.get(pid);
      if (!user) {
        throw new DomainError("UNPROCESSABLE", "Participants must belong to this clinic");
      }
      if (!user.isActive) {
        throw new DomainError("UNPROCESSABLE", "Inactive users cannot join a conversation");
      }
      if (user.role === "PATIENT") {
        const explicitPatientFlow = input.category === "PATIENT" && Boolean(input.patientId);
        if (!explicitPatientFlow || user.patientId !== input.patientId) {
          throw new DomainError(
            "UNPROCESSABLE",
            "Portal users can only join their own patient-communication thread",
          );
        }
        continue;
      }
      if (input.patientId) {
        const eligible = await this.staffCanDiscussPatient(clinicId, pid, input.patientId);
        if (!eligible) {
          throw new DomainError(
            "UNPROCESSABLE",
            "Staff on a patient thread need a treating relationship or the patient's communication consent",
          );
        }
      }
    }
  }

  /** Treating relationship or a granted COMMUNICATION consent (COM-001). */
  private async staffCanDiscussPatient(clinicId: string, userId: string, patientId: string): Promise<boolean> {
    const membership = await this.tx.careTeamMembership.findFirst({
      where: { clinicId, patientId, userId, endedAt: null },
      select: { id: true },
    });
    if (membership) return true;
    const primary = await this.tx.patient.findFirst({
      where: { clinicId, id: patientId, primaryDoctorId: userId },
      select: { id: true },
    });
    if (primary) return true;
    const consent = await this.tx.patientConsent.findFirst({
      where: { clinicId, patientId, type: "COMMUNICATION", status: "GRANTED" },
      select: { id: true },
    });
    return consent !== null;
  }

  async createThread(
    ctx: { tenantId: string; actorId: string },
    input: { subject: string; category: string; patientId?: string; participantIds: string[]; body: string },
  ): Promise<ThreadSummary> {
    const participantIds = Array.from(new Set([ctx.actorId, ...input.participantIds]));
    // Validate before any row is written: one invalid member rejects the
    // whole set inside the caller's transaction.
    await this.assertValidParticipants(ctx.tenantId, participantIds, {
      patientId: input.patientId,
      category: input.category,
    });
    const thread = await this.tx.thread.create({
      data: {
        clinicId: ctx.tenantId,
        subject: input.subject,
        category: input.category as never,
        patientId: input.patientId,
        createdById: ctx.actorId,
        lastMessageAt: new Date(),
      },
    });
    for (const pid of participantIds) {
      await this.tx.threadParticipant.create({
        data: {
          clinicId: ctx.tenantId,
          threadId: thread.id,
          userId: pid,
          lastReadAt: pid === ctx.actorId ? new Date() : null,
        },
      });
    }
    await this.tx.message.create({
      data: {
        clinicId: ctx.tenantId,
        threadId: thread.id,
        senderId: ctx.actorId,
        body: input.body,
      },
    });
    const created = await this.findThread(ctx.tenantId, thread.id, ctx.actorId);
    if (!created) throw new Error("Thread creation failed");
    return created;
  }

  async listMessages(clinicId: string, threadId: string, userId: string): Promise<Message[] | null> {
    const thread = await this.findThread(clinicId, threadId, userId);
    if (!thread) return null;
    const rows = await this.tx.message.findMany({
      where: { clinicId, threadId },
      orderBy: { createdAt: "asc" },
      take: 200,
      include: { sender: { select: { fullName: true } } },
    });
    return rows.map((m) => ({
      id: m.id,
      threadId: m.threadId,
      senderId: m.senderId,
      senderName: m.sender.fullName,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
    }));
  }

  async addMessage(
    ctx: { tenantId: string; actorId: string },
    threadId: string,
    body: string,
  ): Promise<Message | null> {
    const thread = await this.findThread(ctx.tenantId, threadId, ctx.actorId);
    if (!thread) return null;
    const m = await this.tx.message.create({
      data: { clinicId: ctx.tenantId, threadId, senderId: ctx.actorId, body },
      include: { sender: { select: { fullName: true } } },
    });
    await this.tx.thread.update({ where: { id: threadId }, data: { lastMessageAt: new Date() } });
    await this.tx.threadParticipant.updateMany({
      where: { threadId, userId: ctx.actorId },
      data: { lastReadAt: new Date() },
    });
    return {
      id: m.id,
      threadId: m.threadId,
      senderId: m.senderId,
      senderName: m.sender.fullName,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
    };
  }

  async markRead(ctx: { tenantId: string; actorId: string }, threadId: string): Promise<void> {
    await this.tx.threadParticipant.updateMany({
      where: { clinicId: ctx.tenantId, threadId, userId: ctx.actorId },
      data: { lastReadAt: new Date() },
    });
  }

  // ------------------------------------------------------------ notifications

  async notify(
    clinicId: string,
    userId: string,
    input: { category: string; subject: string; body: string },
  ): Promise<void> {
    await this.tx.notification.create({
      data: { clinicId, userId, category: input.category, subject: input.subject, body: input.body },
    });
  }

  async notifyDoctors(
    clinicId: string,
    input: { category: string; subject: string; body: string },
  ): Promise<void> {
    const doctors = await this.tx.user.findMany({
      where: { clinicId, role: "DOCTOR", isActive: true },
      select: { id: true },
    });
    for (const d of doctors) {
      await this.notify(clinicId, d.id, input);
    }
  }

  /** Privacy-owner notification channel (BG-001): every active administrator. */
  async notifyClinicAdmins(
    clinicId: string,
    input: { category: string; subject: string; body: string },
  ): Promise<void> {
    const admins = await this.tx.user.findMany({
      where: { clinicId, role: "ADMIN", isActive: true },
      select: { id: true },
    });
    for (const a of admins) {
      await this.notify(clinicId, a.id, input);
    }
  }

  async listNotifications(clinicId: string, userId: string, unreadOnly = false): Promise<NotificationItem[]> {
    const rows = await this.tx.notification.findMany({
      where: { clinicId, userId, ...(unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return rows.map((n) => ({
      id: n.id,
      category: n.category,
      subject: n.subject,
      body: n.body,
      readAt: n.readAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
    }));
  }

  async markNotificationRead(clinicId: string, userId: string, id: string): Promise<void> {
    await this.tx.notification.updateMany({
      where: { clinicId, userId, id },
      data: { readAt: new Date() },
    });
  }
}
