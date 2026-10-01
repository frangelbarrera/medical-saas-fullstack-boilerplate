/**
 * DSAR routes: data-subject access request workflow and subject export.
 */
import { Router } from "express";
import {
  dsarCreate,
  dsarStatusChange,
} from "@medical/contracts";
import { withTenantRepos } from "@medical/data";
import { asyncHandler, ApiError } from "../middleware/errors.js";
import { validateBody } from "../middleware/validate.js";
import { authenticate, requireCapability, type AuthedRequest } from "../middleware/auth.js";
import { exportLimiter } from "../middleware/security.js";
export const dsarRouter = Router();

dsarRouter.get(
  "/dsar",
  authenticate,
  requireCapability("dsar:manage"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const items = await withTenantRepos(ctx, (repos) => repos.dsar.list(ctx.tenantId, status));
    res.json({ items });
  }),
);

dsarRouter.post(
  "/dsar",
  authenticate,
  requireCapability("dsar:manage"),
  validateBody(dsarCreate),
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const created = await withTenantRepos(ctx, async (repos) => {
      const request = await repos.dsar.create(ctx, req.body);
      await repos.audit.append(ctx, {
        action: "DSAR_CREATED",
        category: "EXPORT",
        subjectPatientId: request.patientId,
        target: request.id,
        details: { type: request.type },
      });
      return request;
    });
    res.status(201).json(created);
  }),
);

dsarRouter.patch(
  "/dsar/:id/status",
  authenticate,
  requireCapability("dsar:manage"),
  validateBody(dsarStatusChange),
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const updated = await withTenantRepos(ctx, async (repos) => {
      const request = await repos.dsar.setStatus(ctx.tenantId, req.params.id, req.body.status, req.body.decisionNote);
      if (request) {
        await repos.audit.append(ctx, {
          action: req.body.status === "FULFILLED" ? "DSAR_FULFILLED" : "DSAR_REJECTED",
          category: "EXPORT",
          subjectPatientId: request.patientId,
          target: request.id,
        });
      }
      return request;
    });
    if (!updated) throw new ApiError(404, "NOT_FOUND", "Request not found");
    res.json(updated);
  }),
);

/**
 * Subject export (step-up: requires dsar:manage + rate limited + audited).
 * Returns the complete data bundle for one patient.
 */
dsarRouter.get(
  "/dsar/export/:patientId",
  authenticate,
  requireCapability("dsar:manage"),
  exportLimiter,
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const bundleData = await withTenantRepos(ctx, async (repos) => {
      const data = await repos.dsar.exportBundle(ctx.tenantId, req.params.patientId);
      if (!data) throw new ApiError(404, "NOT_FOUND", "Patient not found");
      await repos.audit.append(ctx, {
        action: "PATIENT_EXPORTED",
        category: "EXPORT",
        subjectPatientId: req.params.patientId,
        purpose: "PATIENT_REQUEST",
      });
      return data;
    });
    res.setHeader("Content-Disposition", `attachment; filename="patient-export-${req.params.patientId}.json"`);
    res.json(bundleData);
  }),
);
