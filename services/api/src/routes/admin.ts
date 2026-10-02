/**
 * Administration routes: staff users, clinic settings, own sessions.
 */
import { Router } from "express";
import {
  userCreate,
  userUpdate,
  clinicUpdate,
  compliancePackFor,
} from "@medical/contracts";
import { withTenant, withTenantRepos, prisma, authRepo } from "@medical/data";
import { asyncHandler, ApiError } from "../middleware/errors.js";
import { validateBody } from "../middleware/validate.js";
import { authenticate, requireCapability, requireRecentStepUp, type AuthedRequest } from "../middleware/auth.js";

export const adminRouter = Router();

adminRouter.get(
  "/users",
  authenticate,
  requireCapability("admin:users"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const users = await withTenantRepos(ctx, (repos) => repos.users.list(ctx.tenantId));
    res.json({
      items: users.map((u) => ({
        id: u.id,
        username: u.username,
        fullName: u.fullName,
        role: u.role,
        isActive: u.isActive,
        createdAt: "",
      })),
    });
  }),
);

/**
 * Creating or elevating an administrator is a sensitive administrative
 * operation (ADM-001): it requires the 5-minute step-up window opened by a
 * fresh re-authentication, not just a valid session.
 */
const requireStepUpForAdminRole = (req: AuthedRequest, res: unknown, next: (err?: unknown) => void): void => {
  const role = (req.body as { role?: string } | undefined)?.role;
  if (role === "ADMIN") {
    requireRecentStepUp(req, res as never, next);
    return;
  }
  next();
};

adminRouter.post(
  "/users",
  authenticate,
  requireCapability("admin:users"),
  validateBody(userCreate),
  requireStepUpForAdminRole,
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const created = await withTenantRepos(ctx, async (repos) => {
      let user = null;
      try {
        user = await repos.users.create(ctx.tenantId, req.body);
      } catch {
        throw new ApiError(409, "CONFLICT", "Username already exists");
      }
      await repos.audit.append(ctx, {
        action: "USER_CREATED",
        category: "ADMIN",
        target: user.id,
        details: { role: user.role },
      });
      return user;
    });
    res.status(201).json({ id: created.id, username: created.username, fullName: created.fullName, role: created.role });
  }),
);

adminRouter.put(
  "/users/:id",
  authenticate,
  requireCapability("admin:users"),
  validateBody(userUpdate),
  requireStepUpForAdminRole,
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const input = req.body as { fullName?: string; role?: string; isActive?: boolean; password?: string };
    const updated = await withTenantRepos(ctx, async (repos) => {
      const target = await repos.users.findById(ctx.tenantId, req.params.id);
      if (!target) throw new ApiError(404, "NOT_FOUND", "User not found");
      // Self-protection: cannot demote/deactivate yourself.
      if (req.params.id === ctx.actorId && (input.role !== undefined || input.isActive === false)) {
        throw new ApiError(422, "UNPROCESSABLE", "You cannot change your own role or deactivate yourself");
      }
      // Last-admin guard (ADM-001): neither a demotion nor a deactivation
      // may remove the only active administrator of the clinic.
      const removesAdmin =
        target.role === "ADMIN" &&
        target.isActive &&
        ((input.role !== undefined && input.role !== "ADMIN") || input.isActive === false);
      if (removesAdmin) {
        const remaining = await repos.users.countAdmins(ctx.tenantId, target.id);
        if (remaining === 0) {
          throw new ApiError(422, "UNPROCESSABLE", "The clinic must keep at least one active administrator");
        }
      }

      const user = await repos.users.update(ctx.tenantId, req.params.id, input);
      if (!user) throw new ApiError(404, "NOT_FOUND", "User not found");

      // Any loss of privilege or credential change invalidates every live
      // session of the affected user, including refresh tokens (ADM-002).
      const credentialOrPrivilegeChange =
        input.isActive === false || input.role !== undefined || input.password !== undefined;
      if (credentialOrPrivilegeChange) {
        await authRepo().revokeAllForUser(user.id);
        await repos.audit.append(ctx, {
          action: "USER_SESSIONS_INVALIDATED",
          category: "ADMIN",
          target: user.id,
        });
      }

      await repos.audit.append(ctx, {
        action: input.isActive === false ? "USER_DEACTIVATED" : "USER_UPDATED",
        category: "ADMIN",
        target: user.id,
        // Before/after for the audit chain - never secrets or passwords.
        details: {
          fields: Object.keys(input),
          before: { role: target.role, isActive: target.isActive },
          after: { role: user.role, isActive: user.isActive },
        },
      });
      return user;
    });
    res.json({ id: updated.id, username: updated.username, fullName: updated.fullName, role: updated.role, isActive: updated.isActive });
  }),
);

adminRouter.get(
  "/clinic",
  authenticate,
  requireCapability("admin:clinic"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const clinic = await withTenantRepos(ctx, (repos) => repos.clinics.findById(ctx.tenantId));
    if (!clinic) throw new ApiError(404, "NOT_FOUND", "Clinic not found");
    res.json(clinic);
  }),
);

/** Active compliance pack for the clinic's jurisdiction (GOV-001). */
adminRouter.get(
  "/compliance",
  authenticate,
  requireCapability("admin:clinic"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const pack = await withTenantRepos(ctx, async (repos) => {
      const clinic = await repos.clinics.findById(ctx.tenantId);
      return compliancePackFor(clinic?.jurisdiction);
    });
    res.json(pack);
  }),
);

adminRouter.put(
  "/clinic",
  authenticate,
  requireCapability("admin:clinic"),
  validateBody(clinicUpdate),
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const updated = await withTenantRepos(ctx, async (repos) => {
      const clinic = await repos.clinics.update(ctx.tenantId, req.body);
      await repos.audit.append(ctx, {
        action: "CLINIC_UPDATED",
        category: "ADMIN",
        details: { fields: Object.keys(req.body as object) },
      });
      return clinic;
    });
    res.json(updated);
  }),
);

adminRouter.get(
  "/sessions",
  authenticate,
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const sessions = await withTenant(ctx, async (tx) =>
      tx.session.findMany({
        where: { userId: ctx.actorId, revokedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { lastSeenAt: "desc" },
      }),
    );
    res.json({
      items: sessions.map((s) => ({
        id: s.id,
        deviceLabel: s.deviceLabel,
        createdAt: s.createdAt.toISOString(),
        lastSeenAt: s.lastSeenAt.toISOString(),
        expiresAt: s.expiresAt.toISOString(),
        current: s.id === (req as AuthedRequest & { sid?: string }).sid,
      })),
    });
  }),
);

adminRouter.delete(
  "/sessions/:id",
  authenticate,
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const auth = await import("@medical/data").then((m) => m.authRepo());
    const session = await prisma.session.findUnique({ where: { id: req.params.id } });
    if (session && session.userId === ctx.actorId) {
      await auth.revokeSession(req.params.id);
      await withTenantRepos(ctx, (repos) =>
        repos.audit.append(ctx, { action: "AUTH_SESSION_REVOKED", category: "AUTH", target: req.params.id }),
      );
    }
    res.json({ ok: true });
  }),
);
