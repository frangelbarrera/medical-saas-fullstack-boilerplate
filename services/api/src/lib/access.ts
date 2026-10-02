/**
 * Shared route-level access guards.
 *
 * The governed clinical access model (CLIN-003 / CLIN-004) applies to every
 * surface that touches patient-level data: the clinical record, the FHIR
 * mapping and AI draft operations. Keeping the guard in one place makes the
 * policy identical everywhere.
 *   ADMIN:     requires an active, audited break-glass window.
 *   DOCTOR:    requires an ACTIVE care-team membership or the primary-doctor
 *              assignment (CARE_RELATIONSHIP_REQUIRED otherwise).
 *   SECRETARY: never reaches clinical data (directory + scheduling only).
 *   PATIENT:   portal users are self-scoped via assertPatientScope upstream.
 */
import type { AuthedRequest } from "../middleware/auth.js";
import type { Repositories } from "@medical/data";
import { ApiError } from "../middleware/errors.js";

export const assertClinicalAccess = async (
  ctx: NonNullable<AuthedRequest["ctx"]>,
  repos: Repositories,
  patientId: string,
): Promise<void> => {
  if (ctx.actorRole === "ADMIN") {
    const granted = await repos.clinical.hasActiveBreakGlass(ctx.tenantId, ctx.actorId, patientId);
    if (!granted) {
      throw new ApiError(
        403,
        "BREAK_GLASS_REQUIRED",
        "This clinical record requires a justified break-glass access",
        "Provide a reason to open the record under emergency access. The access is logged and expires after 30 minutes.",
      );
    }
    return;
  }
  if (ctx.actorRole === "DOCTOR") {
    const related = await repos.clinical.hasCareRelationship(ctx.tenantId, ctx.actorId, patientId);
    if (!related) {
      throw new ApiError(
        403,
        "CARE_RELATIONSHIP_REQUIRED",
        "You are not part of this patient's care team",
        "Ask the treating clinician or an administrator to add you to the care team. The assignment is audited.",
      );
    }
    return;
  }
  throw new ApiError(403, "FORBIDDEN", "This role cannot access clinical records");
};
