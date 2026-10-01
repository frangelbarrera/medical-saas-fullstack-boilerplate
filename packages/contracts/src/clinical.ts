import { z } from "zod";
import { isoDate } from "./core.js";

// ---------------------------------------------------------------------------
// Clinical record
// ---------------------------------------------------------------------------

export const ENCOUNTER_STATUSES = ["DRAFT", "IN_REVIEW", "SIGNED", "AMENDED"] as const;
export type EncounterStatus = (typeof ENCOUNTER_STATUSES)[number];

export const OBSERVATION_TYPES = [
  "PULSE",
  "TEMPERATURE",
  "BP_SYSTOLIC",
  "BP_DIASTOLIC",
  "WEIGHT",
  "HEIGHT",
  "BMI",
  "CUSTOM",
] as const;

export const encounterCreate = z.object({
  patientId: z.string().uuid(),
  appointmentId: z.string().uuid().optional(),
  title: z.string().min(1).max(200),
  chiefComplaint: z.string().max(4000).optional(),
  observations: z.string().max(20000).optional(),
  plan: z.string().max(20000).optional(),
});
export type EncounterCreate = z.infer<typeof encounterCreate>;

export const encounterUpdate = z.object({
  title: z.string().min(1).max(200).optional(),
  chiefComplaint: z.string().max(4000).nullable().optional(),
  observations: z.string().max(20000).nullable().optional(),
  plan: z.string().max(20000).nullable().optional(),
  changeReason: z.string().max(300).optional(),
});
export type EncounterUpdate = z.infer<typeof encounterUpdate>;

/** Structured snapshot stored per version (validated, not free-form). */
export const encounterSnapshot = z.object({
  title: z.string(),
  chiefComplaint: z.string().nullable(),
  observations: z.string().nullable(),
  plan: z.string().nullable(),
});
export type EncounterSnapshot = z.infer<typeof encounterSnapshot>;

export interface Encounter {
  id: string;
  patientId: string;
  patientName: string;
  doctorId: string;
  doctorName: string;
  appointmentId: string | null;
  title: string;
  chiefComplaint: string | null;
  observations: string | null;
  plan: string | null;
  status: EncounterStatus;
  signedAt: string | null;
  signedById: string | null;
  signedByName: string | null;
  amendedFromId: string | null;
  currentVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface EncounterVersionInfo {
  id: string;
  version: number;
  authorId: string;
  authorName: string;
  changeReason: string | null;
  snapshot: EncounterSnapshot;
  createdAt: string;
}

export const observationInput = z.object({
  patientId: z.string().uuid(),
  encounterId: z.string().uuid().optional(),
  type: z.enum(OBSERVATION_TYPES),
  value: z.string().min(1).max(40),
  unit: z.string().max(20).optional(),
  effectiveAt: isoDate.optional(),
});
export type ObservationInput = z.infer<typeof observationInput>;

export interface Observation {
  id: string;
  patientId: string;
  encounterId: string | null;
  type: (typeof OBSERVATION_TYPES)[number];
  loincCode: string | null;
  value: string;
  unit: string | null;
  effectiveAt: string;
  recordedById: string;
  recordedByName: string | null;
}

export const CODING_SYSTEMS = ["ICD_10", "SNOMED_CT", "LOINC"] as const;
export const PROBLEM_STATUSES = ["ACTIVE", "RESOLVED", "ARCHIVED"] as const;

export const problemInput = z.object({
  patientId: z.string().uuid(),
  encounterId: z.string().uuid().optional(),
  codingSystem: z.enum(CODING_SYSTEMS).default("ICD_10"),
  code: z.string().min(1).max(20),
  display: z.string().min(1).max(300),
  onsetDate: isoDate.optional(),
  notes: z.string().max(2000).optional(),
});
export type ProblemInput = z.infer<typeof problemInput>;

export const problemStatusChange = z.object({
  status: z.enum(PROBLEM_STATUSES),
});
export type ProblemStatusChange = z.infer<typeof problemStatusChange>;

export interface Problem {
  id: string;
  patientId: string;
  encounterId: string | null;
  codingSystem: (typeof CODING_SYSTEMS)[number];
  code: string;
  display: string;
  status: (typeof PROBLEM_STATUSES)[number];
  onsetDate: string | null;
  resolvedAt: string | null;
  verifiedAt: string | null;
  notes: string | null;
  createdAt: string;
}

export const ALLERGY_SEVERITIES = ["MILD", "MODERATE", "SEVERE"] as const;
export const ALLERGY_STATUSES = ["ACTIVE", "INACTIVE", "NO_KNOWN"] as const;

export const allergyInput = z.object({
  patientId: z.string().uuid(),
  substance: z.string().min(1).max(160),
  category: z.string().max(60).optional(),
  reaction: z.string().max(300).optional(),
  severity: z.enum(ALLERGY_SEVERITIES).optional(),
  status: z.enum(ALLERGY_STATUSES).default("ACTIVE"),
});
export type AllergyInput = z.infer<typeof allergyInput>;

export interface Allergy {
  id: string;
  patientId: string;
  substance: string;
  category: string | null;
  reaction: string | null;
  severity: (typeof ALLERGY_SEVERITIES)[number] | null;
  status: (typeof ALLERGY_STATUSES)[number];
  recordedAt: string;
  verifiedAt: string | null;
}

export const MEDICATION_STATUSES = ["DRAFT", "ACTIVE", "COMPLETED", "CANCELLED"] as const;

export const medicationOrderInput = z.object({
  patientId: z.string().uuid(),
  encounterId: z.string().uuid().optional(),
  medicationName: z.string().min(1).max(200),
  dose: z.string().max(80).optional(),
  route: z.string().max(60).optional(),
  frequency: z.string().max(80).optional(),
  durationDays: z.number().int().min(1).max(730).optional(),
  instructions: z.string().max(1000).optional(),
});
export type MedicationOrderInput = z.infer<typeof medicationOrderInput>;

export const medicationStatusChange = z.object({
  status: z.enum(MEDICATION_STATUSES),
});
export type MedicationStatusChange = z.infer<typeof medicationStatusChange>;

export interface MedicationOrder {
  id: string;
  patientId: string;
  encounterId: string | null;
  medicationName: string;
  dose: string | null;
  route: string | null;
  frequency: string | null;
  durationDays: number | null;
  instructions: string | null;
  status: (typeof MEDICATION_STATUSES)[number];
  authoredById: string;
  authoredByName: string | null;
  createdAt: string;
}

export const breakGlassRequest = z.object({
  patientId: z.string().uuid(),
  reason: z.string().min(10, "A specific reason is required").max(500),
});
export type BreakGlassRequest = z.infer<typeof breakGlassRequest>;

export interface ClinicalSummary {
  patientId: string;
  activeProblems: Problem[];
  allergies: Allergy[];
  activeMedications: MedicationOrder[];
  recentObservations: Observation[];
  pendingResults: Observation[];
}

export interface TimelineEvent {
  id: string;
  kind: "ENCOUNTER" | "PROBLEM" | "ALLERGY" | "MEDICATION" | "OBSERVATION" | "APPOINTMENT" | "INVOICE";
  title: string;
  detail: string | null;
  occurredAt: string;
  status: string | null;
  hrefId: string;
}
