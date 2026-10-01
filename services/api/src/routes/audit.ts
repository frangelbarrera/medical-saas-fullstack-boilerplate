/**
 * Audit trail routes: query, chain verification, export.
 */
import { Router } from "express";
import {
  auditQuery,
} from "@medical/contracts";
import { withTenantRepos } from "@medical/data";
import { asyncHandler } from "../middleware/errors.js";
import { validateQuery } from "../middleware/validate.js";
import { authenticate, requireCapability, type AuthedRequest } from "../middleware/auth.js";
import { exportLimiter } from "../middleware/security.js";
export const auditRouter = Router();

auditRouter.get(
  "/audit/events",
  authenticate,
  requireCapability("audit:read"),
  validateQuery(auditQuery),
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const q = (req as typeof req & { validatedQuery: ReturnType<typeof auditQuery.parse> }).validatedQuery;
    const page = await withTenantRepos(ctx, (repos) => repos.audit.query(ctx.tenantId, q));
    res.json(page);
  }),
);

auditRouter.get(
  "/audit/verify",
  authenticate,
  requireCapability("audit:read"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const verification = await withTenantRepos(ctx, async (repos) => {
      const result = await repos.audit.verifyChain(ctx.tenantId);
      await repos.audit.append(ctx, { action: "AUDIT_VERIFIED", category: "SYSTEM", details: { valid: result.valid } });
      return result;
    });
    res.json(verification);
  }),
);

auditRouter.get(
  "/audit/export",
  authenticate,
  requireCapability("audit:read"),
  exportLimiter,
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    await withTenantRepos(ctx, (repos) =>
      repos.audit.append(ctx, { action: "AUDIT_EXPORTED", category: "EXPORT" }),
    );
    const page = await withTenantRepos(ctx, (repos) =>
      repos.audit.query(ctx.tenantId, { page: 1, limit: 100 } as never),
    );
    res.setHeader("Content-Disposition", 'attachment; filename="audit-trail.json"');
    res.json({ exportedAt: new Date().toISOString(), ...page });
  }),
);
