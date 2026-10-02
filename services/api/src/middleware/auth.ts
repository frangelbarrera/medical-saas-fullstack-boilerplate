/**
 * Authentication middleware: minimal-claim JWT + durable session lookup.
 *
 * Flow: verify JWT signature -> load session (revocation check) -> open the
 * tenant context from the token's tenant id -> load the user (active check,
 * fresh role) -> attach the RequestContext. Portal users are self-scoped.
 */
import type { NextFunction, Request, Response } from "express";
import { capabilitiesForRole, isSelfScoped, type Capability, type Role } from "@medical/contracts";
import { prisma, withTenant } from "@medical/data";
import type { RequestContext } from "@medical/domain";
import { ApiError } from "./errors.js";
import { readSessionCookie, verifyAccessToken } from "../lib/tokens.js";

declare module "express-serve-static-core" {
  interface Request {
    ctx?: RequestContext;
  }
}

export interface AuthedRequest extends Request {
  ctx?: RequestContext;
  /** Session-level step-up timestamp: when the last re-authentication happened. */
  stepUpAt?: Date | null;
}

export const authenticate = (req: AuthedRequest, _res: Response, next: NextFunction): void => {
  const token = readSessionCookie(req) ??
    (req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7)
      : null);
  if (!token) return next(new ApiError(401, "UNAUTHORIZED", "Authentication required"));

  const claims = verifyAccessToken(token);
  if (!claims) return next(new ApiError(401, "UNAUTHORIZED", "Invalid or expired session"));

  (async () => {
    // Session lookup (no RLS: infrastructure table).
    const session = await prisma.session.findUnique({ where: { id: claims.sid } });
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new ApiError(401, "SESSION_EXPIRED", "Session expired, please sign in again");
    }
    if (session.userId !== claims.sub) {
      throw new ApiError(401, "UNAUTHORIZED", "Invalid session binding");
    }

    // Load the user inside the tenant context: fresh role + active check.
    const user = await withTenant(
      { clinicId: session.clinicId, actorId: session.userId, actorRole: "" },
      async (tx) =>
        tx.user.findFirst({
          where: { id: session.userId, isActive: true },
          select: { id: true, fullName: true, role: true, patientId: true, clinicId: true },
        }),
    );
    if (!user) throw new ApiError(401, "UNAUTHORIZED", "Account is not active");

    prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => undefined);

    const role = user.role as Role;
    req.ctx = {
      tenantId: session.clinicId,
      actorId: user.id,
      actorRole: role,
      actorName: user.fullName,
      selfPatientId: isSelfScoped(role) ? user.patientId : null,
      requestId: resHeaderRequestId(req),
      capabilities: capabilitiesForRole(role) as Capability[],
    };
    req.stepUpAt = session.stepUpAt;
    next();
  })().catch(next);
};

const resHeaderRequestId = (req: Request): string | undefined =>
  (req.headers["x-request-id"] as string | undefined) ?? undefined;

export const requireCapability = (capability: Capability) => {
  return (req: AuthedRequest, _res: Response, next: NextFunction): void => {
    if (!req.ctx) return next(new ApiError(401, "UNAUTHORIZED", "Authentication required"));
    if (!req.ctx.capabilities.includes(capability)) {
      return next(new ApiError(403, "FORBIDDEN", "Missing capability: " + capability));
    }
    next();
  };
};

/** Privileged window opened by a successful step-up re-authentication. */
export const STEP_UP_WINDOW_MS = 5 * 60 * 1000;

/**
 * Privacy-critical operations (DSAR release, MFA changes) require a fresh
 * re-authentication, not just a valid session (PRIV-001 / AUTH-001).
 */
export const requireRecentStepUp = (req: AuthedRequest, _res: Response, next: NextFunction): void => {
  if (!req.ctx) return next(new ApiError(401, "UNAUTHORIZED", "Authentication required"));
  const at = req.stepUpAt ? new Date(req.stepUpAt).getTime() : 0;
  if (!at || Date.now() - at > STEP_UP_WINDOW_MS) {
    return next(
      new ApiError(
        403,
        "STEP_UP_REQUIRED",
        "Re-authentication required",
        "Confirm your password (and TOTP code when enrolled) to open a 5-minute privileged window.",
      ),
    );
  }
  next();
};
