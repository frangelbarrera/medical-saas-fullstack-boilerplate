import { z } from "zod";

// ---------------------------------------------------------------------------
// Audit trail (catalog + DTOs)
// ---------------------------------------------------------------------------

export const AUDIT_CATEGORIES = ["AUTH", "PHI", "CLINICAL", "BILLING", "AI", "ADMIN", "EXPORT", "SYSTEM"] as const;

/**
 * Event catalog: every audit action MUST come from this list so that the
 * trail stays queryable and retention rules can be attached per category.
 */
export const AUDIT_ACTIONS = [
  // auth
  "AUTH_LOGIN_SUCCESS",
  "AUTH_LOGIN_FAILURE",
  "AUTH_LOGOUT",
  "AUTH_REFRESH",
  "AUTH_TOKEN_REUSE_DETECTED",
  "AUTH_PASSWORD_CHANGED",
  "AUTH_SESSION_REVOKED",
  "AUTH_STEP_UP_SUCCESS",
  "AUTH_STEP_UP_FAILURE",
  "AUTH_MFA_ENROLLMENT_STARTED",
  "AUTH_MFA_ACTIVATED",
  "AUTH_MFA_DISABLED",
  // patients / PHI
  "PATIENT_CREATED",
  "PATIENT_UPDATED",
  "PATIENT_ARCHIVED",
  "PATIENT_VIEWED",
  "PATIENT_EXPORTED",
  "CONSENT_UPDATED",
  // clinical
  "ENCOUNTER_CREATED",
  "ENCOUNTER_UPDATED",
  "ENCOUNTER_SUBMITTED",
  "ENCOUNTER_SIGNED",
  "ENCOUNTER_AMENDED",
  "ENCOUNTER_VIEWED",
  "PROBLEM_RECORDED",
  "ALLERGY_RECORDED",
  "MEDICATION_ORDERED",
  "MEDICATION_STATUS_CHANGED",
  "OBSERVATION_RECORDED",
  "BREAK_GLASS_USED",
  "CARE_TEAM_ASSIGNED",
  "CARE_TEAM_ENDED",
  // scheduling
  "APPOINTMENT_CREATED",
  "APPOINTMENT_UPDATED",
  "APPOINTMENT_STATUS_CHANGED",
  "APPOINTMENT_CANCELLED",
  // messaging
  "MESSAGE_SENT",
  // billing
  "INVOICE_CREATED",
  "INVOICE_STATUS_CHANGED",
  "PAYMENT_RECORDED",
  "EXPENSE_RECORDED",
  "WEBHOOK_PROCESSED",
  "WEBHOOK_REJECTED",
  // ai
  "AI_DRAFT_GENERATED",
  "AI_DRAFT_INSERTED",
  "AI_DRAFT_DISCARDED",
  "AI_CHAT_MESSAGE",
  "AI_CONSENT_BLOCKED",
  // admin / privacy ops
  "USER_CREATED",
  "USER_UPDATED",
  "USER_DEACTIVATED",
  "CLINIC_UPDATED",
  "PROMPT_UPDATED",
  "DSAR_CREATED",
  "DSAR_FULFILLED",
  "DSAR_REJECTED",
  "DSAR_ARTIFACT_PREPARED",
  "DSAR_ARTIFACT_APPROVED",
  "DSAR_DOWNLOAD_ISSUED",
  "DSAR_DOWNLOAD_COMPLETED",
  "DSAR_EXPORT_RETIRED",
  "AUDIT_VERIFIED",
  "AUDIT_EXPORTED",
  "FHIR_RESOURCE_EXPORTED",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface AuditEventInput {
  action: AuditAction;
  category: (typeof AUDIT_CATEGORIES)[number];
  actorId?: string;
  actorRole?: string;
  subjectPatientId?: string;
  target?: string;
  purpose?: string;
  details?: Record<string, unknown>; // non-PHI metadata only
}

export interface AuditEvent {
  id: string;
  seq: number;
  action: string;
  category: string;
  actorId: string | null;
  actorName: string | null;
  actorRole: string | null;
  subjectPatientId: string | null;
  target: string | null;
  purpose: string | null;
  details: Record<string, unknown>;
  createdAt: string;
  hash: string;
}

export interface AuditVerification {
  valid: boolean;
  verifiedCount: number;
  legacyCount: number;
  firstBrokenAt: string | null;
}

export const auditQuery = z.object({
  action: z.string().max(60).optional(),
  category: z.enum(AUDIT_CATEGORIES).optional(),
  subjectPatientId: z.string().uuid().optional(),
  actorId: z.string().uuid().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type AuditQuery = z.infer<typeof auditQuery>;

// ---------------------------------------------------------------------------
// DSAR (data-subject access requests)
// ---------------------------------------------------------------------------

export const DSAR_TYPES = ["ACCESS", "EXPORT", "RECTIFICATION", "OBJECTION", "RESTRICTION"] as const;
export const DSAR_STATUSES = ["OPEN", "IN_PROGRESS", "FULFILLED", "REJECTED"] as const;

export const dsarCreate = z.object({
  patientId: z.string().uuid(),
  type: z.enum(DSAR_TYPES),
  details: z.string().max(2000).optional(),
  dueInDays: z.number().int().min(1).max(90).default(30),
});
export type DsarCreate = z.infer<typeof dsarCreate>;

export const dsarStatusChange = z.object({
  status: z.enum(["IN_PROGRESS", "FULFILLED", "REJECTED"]),
  decisionNote: z.string().max(2000).optional(),
});
export type DsarStatusChange = z.infer<typeof dsarStatusChange>;

export interface DsarRequest {
  id: string;
  patientId: string;
  patientName: string;
  type: (typeof DSAR_TYPES)[number];
  status: (typeof DSAR_STATUSES)[number];
  details: string | null;
  dueAt: string | null;
  fulfilledAt: string | null;
  decisionNote: string | null;
  createdById: string;
  createdByName: string | null;
  createdAt: string;
  /** Governed release: encrypted artifact lifecycle. */
  preparedAt: string | null;
  artifactExpiresAt: string | null;
  approvedAt: string | null;
  approvedByName: string | null;
  downloadIssuedAt: string | null;
  downloadExpiresAt: string | null;
  downloadedAt: string | null;
}

export interface PatientExportBundle {
  generatedAt: string;
  clinic: { id: string; name: string };
  patient: Record<string, unknown>;
  identifiers: Record<string, unknown>[];
  consents: Record<string, unknown>[];
  careTeam: Record<string, unknown>[];
  encounters: Record<string, unknown>[];
  encounterVersions: Record<string, unknown>[];
  problems: Record<string, unknown>[];
  allergies: Record<string, unknown>[];
  medications: Record<string, unknown>[];
  observations: Record<string, unknown>[];
  appointments: Record<string, unknown>[];
  invoices: Record<string, unknown>[];
  payments: Record<string, unknown>[];
  threads: Record<string, unknown>[];
  aiDrafts: Record<string, unknown>[];
  breakGlassEvents: Record<string, unknown>[];
  dsarRequests: Record<string, unknown>[];
  auditEvents: Record<string, unknown>[];
}
