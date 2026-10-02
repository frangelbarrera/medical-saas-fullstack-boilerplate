/**
 * SMART on FHIR scope enforcement (INT-001).
 *
 * A broad capability never substitutes for a narrow scope. Tokens may carry
 * explicit SMART scopes (space-separated, e.g. "patient/Patient.read
 * user/Observation.read") plus an optional patient context; when present,
 * only those scopes authorize FHIR access. Session tokens without explicit
 * scopes map their capabilities to the equivalent user/*.read set, so the
 * governed clinical access model keeps applying.
 *
 * patient/* scopes additionally pin the caller to the token's patient
 * context: any other patient id is out of scope regardless of relationship.
 */
import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../middleware/errors.js";
import type { AuthedRequest } from "../middleware/auth.js";

/** Capability -> equivalent SMART read scopes. */
const CAPABILITY_SCOPES: Record<string, string[]> = {
  "clinical:read": ["user/Patient.read", "user/Observation.read", "user/Condition.read", "user/MedicationRequest.read"],
  "patients:read": ["user/Patient.read"],
  "audit:read": ["user/AuditEvent.read", "user/Provenance.read"],
};

const normalize = (scopes: string[]): Set<string> =>
  new Set(
    scopes
      .flatMap((s) => s.split(/[\s,]+/))
      .filter((s) => s.length > 0),
  );

export const effectiveFhirScopes = (req: AuthedRequest): Set<string> => {
  const explicit = req.claims?.scopes ? normalize([req.claims.scopes]) : null;
  if (explicit) return explicit;
  const mapped = (req.ctx?.capabilities ?? [])
    .flatMap((c) => CAPABILITY_SCOPES[c] ?? []);
  return normalize(mapped);
};

export const requireFhirScope =
  (resourceType: string, req: AuthedRequest, _res: Response, next: NextFunction): void => {
    if (!req.ctx) return next(new ApiError(401, "UNAUTHORIZED", "Authentication required"));
    const scopes = effectiveFhirScopes(req);
    const allowed = scopes.has(`user/${resourceType}.read`) || scopes.has(`patient/${resourceType}.read`);
    if (!allowed) {
      return next(
        new ApiError(
          403,
          "FORBIDDEN",
          `Insufficient scope: ${resourceType} requires a read scope`,
          "The access token does not carry a SMART scope for this resource type.",
        ),
      );
    }
    // Patient-scoped tokens only ever reach their own context.
    const patientContext = req.claims?.patient;
    const patientOnly = scopes.has(`patient/${resourceType}.read`) && !scopes.has(`user/${resourceType}.read`);
    if (patientOnly && patientContext) {
      const requested =
        resourceType === "AuditEvent" || resourceType === "Provenance"
          ? (req.query.patient as string | undefined)?.replace(/^Patient\//, "") ?? req.params.patientId ?? req.params.id
          : req.params.patientId ?? req.params.id;
      if (requested && requested !== patientContext) {
        return next(
          new ApiError(403, "FORBIDDEN", "This resource is outside the token's patient context"),
        );
      }
    }
    next();
  };

/** Express-style middleware factory for FHIR resource reads. */
export const fhirScope =
  (resourceType: string) =>
  (req: Request, res: Response, next: NextFunction): void =>
    requireFhirScope(resourceType, req as AuthedRequest, res, next);
