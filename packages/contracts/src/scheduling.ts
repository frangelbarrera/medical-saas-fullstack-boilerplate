import { z } from "zod";
import { isoDate, isoDateTime } from "./core.js";

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------

export const APPOINTMENT_STATUSES = [
  "SCHEDULED",
  "CONFIRMED",
  "CHECKED_IN",
  "IN_PROGRESS",
  "COMPLETED",
  "NO_SHOW",
  "CANCELLED",
] as const;

export const APPOINTMENT_TYPES = [
  "NEW_PATIENT",
  "FOLLOW_UP",
  "ANNUAL_CHECKUP",
  "PROCEDURE",
  "OTHER",
] as const;

export const appointmentCreate = z
  .object({
    patientId: z.string().uuid(),
    doctorId: z.string().uuid(),
    type: z.enum(APPOINTMENT_TYPES).default("FOLLOW_UP"),
    startTime: isoDateTime,
    durationMinutes: z.number().int().min(5).max(480),
    reason: z.string().max(300).optional(),
    notes: z.string().max(2000).optional(),
    room: z.string().max(60).optional(),
  })
  .refine((v) => v.durationMinutes >= 5, { path: ["durationMinutes"], message: "Minimum duration is 5 minutes" });
export type AppointmentCreate = z.infer<typeof appointmentCreate>;

export const appointmentUpdate = z.object({
  type: z.enum(APPOINTMENT_TYPES).optional(),
  startTime: isoDateTime.optional(),
  durationMinutes: z.number().int().min(5).max(480).optional(),
  reason: z.string().max(300).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  room: z.string().max(60).nullable().optional(),
});
export type AppointmentUpdate = z.infer<typeof appointmentUpdate>;

export const appointmentStatusChange = z.object({
  status: z.enum(APPOINTMENT_STATUSES),
});
export type AppointmentStatusChange = z.infer<typeof appointmentStatusChange>;

export interface Appointment {
  id: string;
  patientId: string;
  patientName: string;
  patientInternalRef: string;
  doctorId: string;
  doctorName: string;
  type: (typeof APPOINTMENT_TYPES)[number];
  startTime: string; // UTC ISO
  endTime: string; // UTC ISO
  status: (typeof APPOINTMENT_STATUSES)[number];
  reason: string | null;
  notes: string | null;
  room: string | null;
  encounterId: string | null;
}

export interface DaybookOverview {
  date: string; // ISO date the numbers refer to
  appointmentsToday: number;
  waitingNow: number;
  resultsToReview: number;
  unreadMessages: number;
  today: Appointment[];
  toReview: ReviewItem[];
  clinicPulse: {
    onTimeRate: number | null; // 0..1 over last 30 days
    satisfaction: number | null;
    totalAppointments30d: number;
  };
}

export interface ReviewItem {
  id: string;
  kind: "RESULTS" | "NOTES" | "MESSAGES" | "REFERRALS";
  title: string;
  detail: string;
  dueLabel: string;
  href: string;
  critical: boolean;
}

// Self-booking (PAT-002). validFrom/validTo bound the rule's lifetime in
// the clinic's local calendar; openSlots ignores expired rules.
export const availabilityRuleInput = z
  .object({
    doctorId: z.string().uuid(),
    weekday: z.number().int().min(0).max(6),
    startMinute: z.number().int().min(0).max(1439),
    endMinute: z.number().int().min(1).max(1440),
    validFrom: isoDate.optional(),
    validTo: isoDate.optional(),
  })
  .refine((v) => v.startMinute < v.endMinute, {
    path: ["endMinute"],
    message: "End must be after start",
  })
  .refine((v) => !v.validFrom || !v.validTo || v.validFrom <= v.validTo, {
    path: ["validTo"],
    message: "validTo must not precede validFrom",
  });
export type AvailabilityRuleInput = z.infer<typeof availabilityRuleInput>;

export interface OpenSlot {
  doctorId: string;
  doctorName: string;
  startTime: string;
  endTime: string;
}
