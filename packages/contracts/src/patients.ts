import { z } from "zod";
import { isoDate } from "./core.js";

// ---------------------------------------------------------------------------
// Patients
// ---------------------------------------------------------------------------

export const PATIENT_STATUSES = ["ACTIVE", "INACTIVE", "ARCHIVED"] as const;
export const IDENTIFIER_TYPES = ["INTERNAL", "PASSPORT", "NATIONAL_ID", "INSURANCE"] as const;
export const SEXES = ["female", "male", "other", "unknown"] as const;

/** Minimal projection for lists: never exposes full identifiers or contacts. */
export interface PatientListItem {
  id: string;
  internalRef: string;
  fullName: string;
  birthYear: number | null;
  sex: string | null;
  status: (typeof PATIENT_STATUSES)[number];
  primaryDoctorId: string | null;
  primaryDoctorName: string | null;
  lastVisitAt: string | null;
}

export const patientIdentifierInput = z.object({
  type: z.enum(IDENTIFIER_TYPES),
  value: z.string().min(1).max(80),
  isPrimary: z.boolean().default(false),
});
export type PatientIdentifierInput = z.infer<typeof patientIdentifierInput>;

export const patientCreate = z.object({
  fullName: z.string().min(1).max(160),
  birthDate: isoDate.optional(),
  sex: z.enum(SEXES).optional(),
  phone: z.string().max(40).optional(),
  email: z.string().email().max(160).optional(),
  address: z.string().max(300).optional(),
  primaryDoctorId: z.string().uuid().optional(),
  defaultPayerId: z.string().uuid().optional(),
  identifiers: z.array(patientIdentifierInput).max(6).default([]),
});
export type PatientCreate = z.infer<typeof patientCreate>;

export const patientUpdate = z.object({
  fullName: z.string().min(1).max(160).optional(),
  birthDate: isoDate.nullable().optional(),
  sex: z.enum(SEXES).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  email: z.string().email().max(160).nullable().optional(),
  address: z.string().max(300).nullable().optional(),
  status: z.enum(PATIENT_STATUSES).optional(),
  primaryDoctorId: z.string().uuid().nullable().optional(),
  defaultPayerId: z.string().uuid().nullable().optional(),
});
export type PatientUpdate = z.infer<typeof patientUpdate>;

/**
 * Directory-only detail projection (SEC-001). The fields a scheduling or
 * reception view needs - and nothing else: no birth date, no contact PHI,
 * no identifiers, no consents. The API layer must serve exactly this shape
 * to roles without patients:phi_write.
 */
export interface PatientDirectoryDetail {
  id: string;
  internalRef: string;
  fullName: string;
  status: (typeof PATIENT_STATUSES)[number];
  primaryDoctorId: string | null;
  primaryDoctorName: string | null;
}

export interface PatientDetail {
  id: string;
  internalRef: string;
  fullName: string;
  birthDate: string | null;
  birthYear: number | null;
  sex: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  status: (typeof PATIENT_STATUSES)[number];
  primaryDoctorId: string | null;
  defaultPayerId: string | null;
  createdAt: string;
  updatedAt: string;
  identifiers: PatientIdentifier[];
  consents: PatientConsent[];
}

export interface PatientIdentifier {
  id: string;
  type: (typeof IDENTIFIER_TYPES)[number];
  value: string; // decrypted for clinical:read holders only
  isPrimary: boolean;
}

export const CONSENT_TYPES = ["TREATMENT", "DATA_SHARING", "AI_PROCESSING", "COMMUNICATION"] as const;
export const CONSENT_STATUSES = ["GRANTED", "REFUSED", "EXPIRED"] as const;

export interface PatientConsent {
  id: string;
  type: (typeof CONSENT_TYPES)[number];
  status: (typeof CONSENT_STATUSES)[number];
  grantedAt: string | null;
  expiresAt: string | null;
  note: string | null;
}

export const consentUpsert = z.object({
  type: z.enum(CONSENT_TYPES),
  status: z.enum(CONSENT_STATUSES),
  note: z.string().max(300).optional(),
});
export type ConsentUpsert = z.infer<typeof consentUpsert>;

// ---------------------------------------------------------------------------
// Care team (CLIN-004): the treating relationship between staff and patient.
// Clinical access is granted through an ACTIVE membership (or a primary-doctor
// assignment) plus break-glass for administrators - never through bare
// capabilities alone.
// ---------------------------------------------------------------------------

export const CARE_TEAM_ROLES = ["CARING_DOCTOR", "CONSULTANT", "NURSE", "THERAPIST"] as const;

export interface CareTeamMember {
  id: string;
  patientId: string;
  userId: string;
  userName: string;
  userRole: string;
  memberRole: (typeof CARE_TEAM_ROLES)[number];
  startedAt: string;
  endedAt: string | null;
}

export const careTeamAssign = z.object({
  userId: z.string().uuid(),
  memberRole: z.enum(CARE_TEAM_ROLES).default("CARING_DOCTOR"),
});
export type CareTeamAssign = z.infer<typeof careTeamAssign>;

// ---------------------------------------------------------------------------
// Payers
// ---------------------------------------------------------------------------

export const payerCreate = z.object({
  name: z.string().min(1).max(120),
  type: z.enum(["INSURANCE", "PRIVATE", "OTHER"]).default("INSURANCE"),
});
export type PayerCreate = z.infer<typeof payerCreate>;

export interface Payer {
  id: string;
  name: string;
  type: string;
}

export const patientSearchQuery = z.object({
  q: z.string().max(120).default(""),
  status: z.enum(PATIENT_STATUSES).optional(),
  primaryDoctorId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export type PatientSearchQuery = z.infer<typeof patientSearchQuery>;
