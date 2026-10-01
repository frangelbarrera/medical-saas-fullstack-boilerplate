import type { Capability } from "@medical/contracts";
import { isSelfScoped } from "@medical/contracts";
import type { RequestContext } from "./context.js";
import { DomainError } from "./context.js";

/**
 * Authorization policies. The API layer calls these guards before touching
 * repositories; they never depend on transport details.
 */
export const can = (ctx: RequestContext, capability: Capability): boolean =>
  ctx.capabilities.includes(capability);

export const requireCapability = (ctx: RequestContext, capability: Capability): void => {
  if (!can(ctx, capability)) {
    throw new DomainError("FORBIDDEN", `Missing capability: ${capability}`);
  }
};

/**
 * Patient portal users are always self-scoped: any patient id that is not
 * their own is invisible to them (404, not 403 - no existence leak).
 */
export const assertPatientScope = (ctx: RequestContext, patientId: string): void => {
  if (!isSelfScoped(ctx.actorRole)) return;
  if (ctx.selfPatientId !== patientId) {
    throw new DomainError("NOT_FOUND", "Patient not found");
  }
};

/** Exporting or bulk-revealing PHI requires step-up confirmation upstream. */
export const canExport = (ctx: RequestContext): boolean =>
  can(ctx, "dsar:manage") || can(ctx, "admin:clinic");
