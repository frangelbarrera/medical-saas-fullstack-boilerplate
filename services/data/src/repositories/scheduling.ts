/**
 * Scheduling repository: appointments, overlap detection, daybook overview
 * and self-booking availability.
 */
import type { Tx } from "../client.js";
import type {
  Appointment,
  AppointmentCreate,
  AppointmentUpdate,
  DaybookOverview,
  ReviewItem,
  OpenSlot,
} from "@medical/contracts";

export class SchedulingRepository {
  constructor(private tx: Tx) {}

  private toDto(a: {
    id: string;
    patientId: string;
    doctorId: string;
    type: string;
    startTime: Date;
    endTime: Date;
    status: string;
    reason: string | null;
    notes: string | null;
    room: string | null;
    encounter: { id: string } | null;
    patient: { fullName: string; internalRef: string };
    doctor: { fullName: string };
  }): Appointment {
    return {
      id: a.id,
      patientId: a.patientId,
      patientName: a.patient.fullName,
      patientInternalRef: a.patient.internalRef,
      doctorId: a.doctorId,
      doctorName: a.doctor.fullName,
      type: a.type as Appointment["type"],
      startTime: a.startTime.toISOString(),
      endTime: a.endTime.toISOString(),
      status: a.status as Appointment["status"],
      reason: a.reason,
      notes: a.notes,
      room: a.room,
      encounterId: a.encounter?.id ?? null,
    };
  }

  private include() {
    return {
      patient: { select: { fullName: true, internalRef: true } },
      doctor: { select: { fullName: true } },
      encounter: { select: { id: true } },
    };
  }

  async listRange(clinicId: string, from: Date, to: Date, doctorId?: string): Promise<Appointment[]> {
    const rows = await this.tx.appointment.findMany({
      where: {
        clinicId,
        startTime: { gte: from, lte: to },
        ...(doctorId ? { doctorId } : {}),
      },
      orderBy: { startTime: "asc" },
      include: this.include(),
    });
    return rows.map((r) => this.toDto(r));
  }

  async findById(clinicId: string, id: string): Promise<Appointment | null> {
    const a = await this.tx.appointment.findFirst({
      where: { clinicId, id },
      include: this.include(),
    });
    return a ? this.toDto(a) : null;
  }

  /** Returns conflicting appointments for the same doctor (excluding cancelled). */
  async findConflicts(
    clinicId: string,
    doctorId: string,
    start: Date,
    end: Date,
    excludeId?: string,
  ): Promise<{ id: string }[]> {
    return this.tx.appointment.findMany({
      where: {
        clinicId,
        doctorId,
        id: excludeId ? { not: excludeId } : undefined,
        status: { notIn: ["CANCELLED"] },
        AND: [
          { startTime: { lt: end } },
          { endTime: { gt: start } },
        ],
      },
      select: { id: true },
    });
  }

  async create(clinicId: string, input: AppointmentCreate): Promise<Appointment> {
    const a = await this.tx.appointment.create({
      data: {
        clinicId,
        patientId: input.patientId,
        doctorId: input.doctorId,
        type: input.type as never,
        startTime: new Date(input.startTime),
        endTime: new Date(new Date(input.startTime).getTime() + input.durationMinutes * 60000),
        reason: input.reason,
        notes: input.notes,
        room: input.room,
      },
      include: this.include(),
    });
    return this.toDto(a);
  }

  async update(clinicId: string, id: string, input: AppointmentUpdate): Promise<Appointment | null> {
    const existing = await this.tx.appointment.findFirst({ where: { clinicId, id } });
    if (!existing) return null;
    const start = input.startTime ? new Date(input.startTime) : existing.startTime;
    const duration =
      input.durationMinutes ??
      (existing.endTime.getTime() - existing.startTime.getTime()) / 60000;
    const a = await this.tx.appointment.update({
      where: { id },
      data: {
        ...(input.type !== undefined ? { type: input.type as never } : {}),
        ...(input.startTime !== undefined ? { startTime: start } : {}),
        ...(input.durationMinutes !== undefined || input.startTime !== undefined
          ? { endTime: new Date(start.getTime() + duration * 60000) }
          : {}),
        ...(input.reason !== undefined ? { reason: input.reason } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.room !== undefined ? { room: input.room } : {}),
      },
      include: this.include(),
    });
    return this.toDto(a);
  }

  async setStatus(clinicId: string, id: string, status: string): Promise<Appointment | null> {
    const existing = await this.tx.appointment.findFirst({ where: { clinicId, id } });
    if (!existing) return null;
    const a = await this.tx.appointment.update({
      where: { id },
      data: { status: status as never },
      include: this.include(),
    });
    return this.toDto(a);
  }

  async daybook(clinicId: string, now = new Date()): Promise<Omit<DaybookOverview, "toReview" | "clinicPulse"> & { toReview: ReviewItem[]; clinicPulse: DaybookOverview["clinicPulse"] }> {
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart.getTime() + 24 * 3600 * 1000);

    const [today, waiting, unsigned, participants] = await Promise.all([
      this.listRange(clinicId, dayStart, dayEnd),
      this.tx.appointment.count({
        where: { clinicId, status: "CHECKED_IN", startTime: { gte: dayStart, lte: dayEnd } },
      }),
      this.tx.encounter.count({ where: { clinicId, status: { in: ["DRAFT", "IN_REVIEW"] } } }),
      this.tx.threadParticipant.findMany({
        where: { clinicId },
        select: { lastReadAt: true, thread: { select: { lastMessageAt: true } } },
      }),
    ]);
    const unread = participants.filter(
      (p) => p.thread.lastMessageAt && (!p.lastReadAt || p.thread.lastMessageAt > p.lastReadAt),
    ).length;

    const pendingResults = await this.tx.observation.findMany({
      where: { clinicId, encounterId: null },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { patient: { select: { fullName: true } } },
    });

    const toReview: ReviewItem[] = [];
    for (const o of pendingResults) {
      toReview.push({
        id: `obs-${o.id}`,
        kind: "RESULTS",
        title: "Lab results",
        detail: `${o.patient.fullName} · ${o.type.toLowerCase().replace(/_/g, " ")}`,
        dueLabel: "Awaiting review",
        href: `/patients/${o.patientId}/record`,
        critical: false,
      });
    }
    if (unsigned > 0) {
      toReview.push({
        id: "unsigned-notes",
        kind: "NOTES",
        title: "Clinical notes",
        detail: `${unsigned} encounter${unsigned === 1 ? "" : "s"} awaiting signature`,
        dueLabel: "Signature required",
        href: "/agenda",
        critical: true,
      });
    }
    if (unread > 0) {
      toReview.push({
        id: "unread-messages",
        kind: "MESSAGES",
        title: "Patient messages",
        detail: `${unread} unread message${unread === 1 ? "" : "s"}`,
        dueLabel: "Inbox",
        href: "/messages",
        critical: false,
      });
    }

    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
    const [total30, completed30] = await Promise.all([
      this.tx.appointment.count({
        where: { clinicId, startTime: { gte: thirtyDaysAgo }, status: { notIn: ["CANCELLED", "NO_SHOW"] } },
      }),
      this.tx.appointment.count({
        where: { clinicId, startTime: { gte: thirtyDaysAgo }, status: "COMPLETED" },
      }),
    ]);

    return {
      date: dayStart.toISOString().slice(0, 10),
      appointmentsToday: today.length,
      waitingNow: waiting,
      resultsToReview: pendingResults.length,
      unreadMessages: unread,
      today,
      toReview,
      clinicPulse: {
        onTimeRate: total30 > 0 ? completed30 / total30 : null,
        satisfaction: null,
        totalAppointments30d: total30,
      },
    };
  }

  // ----- self-booking availability (PAT-002) -----

  async setAvailabilityRule(clinicId: string, input: { doctorId: string; weekday: number; startMinute: number; endMinute: number }) {
    const existing = await this.tx.availabilityRule.findFirst({
      where: { clinicId, doctorId: input.doctorId, weekday: input.weekday },
    });
    if (existing) {
      return this.tx.availabilityRule.update({
        where: { id: existing.id },
        data: { startMinute: input.startMinute, endMinute: input.endMinute },
      });
    }
    return this.tx.availabilityRule.create({
      data: {
        clinicId,
        doctorId: input.doctorId,
        weekday: input.weekday,
        startMinute: input.startMinute,
        endMinute: input.endMinute,
      },
    });
  }

  async listAvailabilityRules(clinicId: string) {
    return this.tx.availabilityRule.findMany({
      where: { clinicId },
      include: { doctor: { select: { fullName: true } } },
      orderBy: [{ doctorId: "asc" }, { weekday: "asc" }],
    });
  }

  /**
   * Compute open 30-minute slots for a date from availability rules minus
   * booked appointments. Times are UTC; slot computation uses UTC days.
   */
  async openSlots(clinicId: string, dateISO: string): Promise<OpenSlot[]> {
    const day = new Date(`${dateISO}T00:00:00.000Z`);
    if (Number.isNaN(day.getTime())) return [];
    const weekday = day.getUTCDay();
    const dayEnd = new Date(day.getTime() + 24 * 3600 * 1000);

    const rules = await this.tx.availabilityRule.findMany({
      where: { clinicId, weekday, OR: [{ validFrom: null }, { validFrom: { lte: day } }] },
      include: { doctor: { select: { id: true, fullName: true } } },
    });
    const activeDoctors = await this.tx.user.findMany({
      where: { clinicId, role: "DOCTOR", isActive: true },
      select: { id: true },
    });
    const activeIds = new Set(activeDoctors.map((d) => d.id));

    const booked = await this.tx.appointment.findMany({
      where: { clinicId, startTime: { gte: day, lt: dayEnd }, status: { notIn: ["CANCELLED"] } },
      select: { doctorId: true, startTime: true, endTime: true },
    });

    const slots: OpenSlot[] = [];
    const SLOT_MIN = 30;
    for (const rule of rules) {
      if (!activeIds.has(rule.doctorId)) continue;
      for (let m = rule.startMinute; m + SLOT_MIN <= rule.endMinute; m += SLOT_MIN) {
        const start = new Date(day.getTime() + m * 60000);
        const end = new Date(start.getTime() + SLOT_MIN * 60000);
        const overlap = booked.some(
          (b) => b.doctorId === rule.doctorId && b.startTime < end && b.endTime > start,
        );
        if (!overlap) {
          slots.push({
            doctorId: rule.doctorId,
            doctorName: rule.doctor.fullName,
            startTime: start.toISOString(),
            endTime: end.toISOString(),
          });
        }
      }
    }
    return slots.sort((a, b) => a.startTime.localeCompare(b.startTime));
  }
}
