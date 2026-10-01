/**
 * Domain layer: request context, authorization policies and clinical rules.
 *
 * The domain layer depends only on contracts - never on Prisma or Express.
 * Use cases orchestrate repositories (interfaces) provided by the caller.
 */
export interface RequestContext {
  /** tenant id (clinic). NEVER taken from request input. */
  tenantId: string;
  actorId: string;
  actorRole: "ADMIN" | "DOCTOR" | "SECRETARY" | "PATIENT";
  actorName: string;
  /** for PATIENT-role sessions: the only patient they may access */
  selfPatientId: string | null;
  requestId?: string;
  sourceIp?: string;
  capabilities: import("@medical/contracts").Capability[];
}

export class DomainError extends Error {
  constructor(
    public code:
      | "FORBIDDEN"
      | "NOT_FOUND"
      | "CONFLICT"
      | "INVALID_STATE_TRANSITION"
      | "BREAK_GLASS_REQUIRED"
      | "CONSENT_REQUIRED"
      | "UNPROCESSABLE",
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}
