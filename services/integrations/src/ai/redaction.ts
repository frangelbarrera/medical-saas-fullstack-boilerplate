/**
 * PHI redaction for LLM calls (AI-001).
 *
 * Modes (LLM_PHI_MODE):
 *  - strip:        replace PHI values with stable placeholders (default, safe
 *                  without a data processing agreement)
 *  - redact:       partial masking (first/last character kept)
 *  - passthrough:  no filtering - ONLY allowed with a signed DPA/BAA and an
 *                  explicit AI_PROCESSING consent per patient
 *
 * Free text is additionally scrubbed for common PHI patterns (emails, phone
 * numbers, ID-like sequences, dates of birth).
 */
import type { PhiMode } from "@medical/contracts";

export interface SanitizedPatient {
  name: string | null;
  identifier: string | null;
  email: string | null;
  phone: string | null;
  birthDate: string | null;
  address: string | null;
}

export const PHI_PLACEHOLDERS = {
  name: "[PATIENT_NAME]",
  identifier: "[PATIENT_ID]",
  email: "[PATIENT_EMAIL]",
  phone: "[PATIENT_PHONE]",
  birthDate: "[PATIENT_DOB]",
  address: "[PATIENT_ADDRESS]",
} as const;

const mask = (value: string): string => {
  if (value.length < 2) return "[REDACTED]";
  return value[0] + "*".repeat(Math.max(2, value.length - 2)) + value[value.length - 1];
};

export const sanitizePatientForLLM = (
  patient: {
    name?: string | null;
    identifiers?: { value: string }[];
    email?: string | null;
    phone?: string | null;
    birthDate?: string | null;
    address?: string | null;
  },
  mode: PhiMode,
): SanitizedPatient => {
  if (mode === "passthrough") {
    return {
      name: patient.name ?? null,
      identifier: patient.identifiers?.[0]?.value ?? null,
      email: patient.email ?? null,
      phone: patient.phone ?? null,
      birthDate: patient.birthDate ?? null,
      address: patient.address ?? null,
    };
  }
  const apply = (field: keyof typeof PHI_PLACEHOLDERS, value: string | null | undefined): string | null => {
    if (!value) return null;
    return mode === "strip" ? PHI_PLACEHOLDERS[field] : mask(value);
  };
  return {
    name: apply("name", patient.name),
    identifier: apply("identifier", patient.identifiers?.[0]?.value),
    email: apply("email", patient.email),
    phone: apply("phone", patient.phone),
    birthDate: apply("birthDate", patient.birthDate),
    address: apply("address", patient.address),
  };
};

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.]{2,}/g;
const PHONE_RE = /(?:\+\d{1,3}[ .-]?)?(?:\(?\d{2,4}\)?[ .-]?){2,4}\d{2,4}/g;
const ID_RE = /\b[A-Z]{1,3}[-.]?\d{4,12}\b/g;
const DOB_RE = /\b(?:19|20)\d{2}[-/.](?:0[1-9]|1[0-2])[-/.](?:0[1-9]|[12]\d|3[01])\b/g;

/** Scrub free-form text that may contain typed PHI. */
export const sanitizeFreeText = (text: string, mode: PhiMode): string => {
  if (mode === "passthrough") return text;
  let out = text;
  if (mode === "strip") {
    out = out.replace(EMAIL_RE, "[EMAIL]").replace(PHONE_RE, "[PHONE]").replace(ID_RE, "[ID]").replace(DOB_RE, "[DOB]");
  } else {
    out = out.replace(EMAIL_RE, (m) => mask(m)).replace(PHONE_RE, (m) => mask(m)).replace(ID_RE, (m) => mask(m)).replace(DOB_RE, (m) => mask(m));
  }
  return out;
};

/** Deterministic marker added to assistant replies for auditability. */
export const AI_DISCLOSURE = "Generated with AI assistance - clinician review required.";
