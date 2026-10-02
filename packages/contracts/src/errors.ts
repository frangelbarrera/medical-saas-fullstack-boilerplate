/**
 * RFC 9457 Problem Details error contract.
 *
 * Every API error response uses this shape. `code` is a stable, machine
 * readable identifier from the error catalog; `title` is a short human
 * summary; `detail` carries safe, non-sensitive context; `errors` lists
 * field-level validation problems.
 */

export interface ProblemDetail {
  type: string; // URI reference for the error category
  title: string; // short human summary (localized server-side default: English)
  status: number;
  code: ErrorCode;
  detail?: string;
  errors?: FieldError[];
  instance?: string;
  /**
   * Safe RFC 9457 extension members. Only directory-visible scalars may be
   * attached here (e.g. name/internalRef so a client can render an access
   * gate without receiving contact PHI).
   */
  meta?: Record<string, string | number | boolean | null>;
}

export interface FieldError {
  field: string;
  message: string;
}

/** Stable machine-readable error codes. Never change existing values. */
export const ERROR_CODES = [
  "VALIDATION_FAILED",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "UNPROCESSABLE",
  "RATE_LIMITED",
  "CROSS_TENANT",
  "OVERLAPPING_APPOINTMENT",
  "INVALID_CREDENTIALS",
  "SESSION_EXPIRED",
  "TOKEN_REUSE_DETECTED",
  "INVALID_STATE_TRANSITION",
  "AI_PROVIDER_UNAVAILABLE",
  "AI_NOT_ENABLED",
  "CONSENT_REQUIRED",
  "BREAK_GLASS_REQUIRED",
  "CARE_RELATIONSHIP_REQUIRED",
  "DIRECTORY_ONLY",
  "STEP_UP_REQUIRED",
  "MFA_REQUIRED",
  "MFA_INVALID_CODE",
  "DSAR_APPROVAL_REQUIRED",
  "ARTIFACT_UNAVAILABLE",
  "PAYLOAD_TOO_LARGE",
  "INTERNAL",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export const problem = (
  code: ErrorCode,
  title: string,
  status: number,
  extra?: {
    detail?: string;
    errors?: FieldError[];
    instance?: string;
    meta?: Record<string, string | number | boolean | null>;
  },
): ProblemDetail => ({
  type: `https://medical-saas.local/errors/${code.toLowerCase().replace(/_/g, "-")}`,
  title,
  status,
  code,
  ...extra,
});
