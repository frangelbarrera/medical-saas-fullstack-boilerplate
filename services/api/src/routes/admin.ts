/**
 * Administration routes: staff users, clinic settings, own sessions.
 */
import { Router } from "express";
import {
  userCreate,
  userUpdate,
  clinicUpdate,
} from "@medical/contracts";
import { withTenant, withTenantRepos, prisma } from "@medical/data";
import { asyncHandler, ApiError } from "../middleware/errors.js";
import { validateBody } from "../middleware/validate.js";
import { authenticate, requireCapability, type AuthedRequest } from "../middleware/auth.js";

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

adminRouter.post(
  "/users",
  authenticate,
  requireCapability("admin:users"),
  validateBody(userCreate),
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
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const updated = await withTenantRepos(ctx, async (repos) => {
      // Self-protection: cannot demote/deactivate yourself.
      if (req.params.id === ctx.actorId && (req.body.role !== undefined || req.body.isActive === false)) {
        throw new ApiError(422, "UNPROCESSABLE", "You cannot change your own role or deactivate yourself");
      }
      // Keep at least one active admin per clinic.
      if (req.body.role !== undefined && req.body.role !== "ADMIN") {
        const admins = await repos.users.countAdmins(ctx.tenantId, req.params.id);
        const target = await repos.users.findById(ctx.tenantId, req.params.id);
        if (target?.role === "ADMIN" && admins === 0) {
          throw new ApiError(422, "UNPROCESSABLE", "The clinic must keep at least one active administrator");
        }
      }
      const user = await repos.users.update(ctx.tenantId, req.params.id, req.body);
      if (!user) throw new ApiError(404, "NOT_FOUND", "User not found");
      await repos.audit.append(ctx, {
        action: req.body.isActive === false ? "USER_DEACTIVATED" : "USER_UPDATED",
        category: "ADMIN",
        target: user.id,
        details: { fields: Object.keys(req.body as object) },
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
