/**
 * DSAR routes: data-subject access request workflow with a governed release
 * flow (PRIV-001). The legacy direct export was retired (410): exports now
 * require a step-up re-authentication, an encrypted artifact, dual-control
 * approval (approver != requester) and a single-use, audited download token.
 */
import { Router } from "express";
import {
  dsarCreate,
  dsarStatusChange,
} from "@medical/contracts";
import { withTenantRepos, decryptPHI, encryptPHI, sha256 } from "@medical/data";
import { asyncHandler, ApiError } from "../middleware/errors.js";
import { validateBody } from "../middleware/validate.js";
import {
  authenticate,
  requireCapability,
  requireRecentStepUp,
  type AuthedRequest,
} from "../middleware/auth.js";
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
      // A request may only be marked FULFILLED once the dual-control
      // approval is recorded on it (PRIV-001).
      if (req.body.status === "FULFILLED") {
        const request = await repos.dsar.findById(ctx.tenantId, req.params.id);
        if (!request) throw new ApiError(404, "NOT_FOUND", "Request not found");
        if (!request.approvedAt) {
          throw new ApiError(
            403,
            "DSAR_APPROVAL_REQUIRED",
            "Release requires a recorded dual-control approval",
            "A second staff member must approve the prepared artifact before the request can be fulfilled.",
          );
        }
      }
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
 * Retired direct export (PRIV-001): the uncontrolled bundle download is gone.
 * The attempt itself is audited so repeated use of the old path is visible.
 */
dsarRouter.get(
  "/dsar/export/:patientId",
  authenticate,
  requireCapability("dsar:manage"),
  asyncHandler(async (req: AuthedRequest, _res) => {
    const ctx = req.ctx!;
    await withTenantRepos(ctx, (repos) =>
      repos.audit.append(ctx, {
        action: "DSAR_EXPORT_RETIRED",
        category: "EXPORT",
        subjectPatientId: req.params.patientId,
      }),
    );
    throw new ApiError(
      410,
      "UNPROCESSABLE",
      "Direct export is no longer available",
      "Use the governed release flow: prepare, approve, release, then download with the one-time token.",
    );
  }),
);

/**
 * Prepare: assemble the full export bundle, encrypt it as an AES-256-GCM
 * artifact (24h lifetime) and stamp the request. Requires a fresh step-up.
 */
dsarRouter.post(
  "/dsar/:id/prepare",
  authenticate,
  requireCapability("dsar:manage"),
  exportLimiter,
  requireRecentStepUp,
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const request = await withTenantRepos(ctx, async (repos) => {
      const existing = await repos.dsar.findById(ctx.tenantId, req.params.id);
      if (!existing) throw new ApiError(404, "NOT_FOUND", "Request not found");
      const bundle = await repos.dsar.exportBundle(ctx.tenantId, existing.patientId);
      if (!bundle) throw new ApiError(404, "NOT_FOUND", "Patient not found");
      const plaintext = JSON.stringify(bundle);
      const ciphertext = encryptPHI(plaintext);
      if (!ciphertext) throw new ApiError(422, "UNPROCESSABLE", "Export bundle could not be encrypted");
      const updated = await repos.dsar.saveArtifact(
        ctx,
        req.params.id,
        ciphertext,
        Buffer.byteLength(plaintext),
        sha256(plaintext),
      );
      if (existing.status === "OPEN") {
        await repos.dsar.setStatus(ctx.tenantId, req.params.id, "IN_PROGRESS");
      }
      await repos.audit.append(ctx, {
        action: "DSAR_ARTIFACT_PREPARED",
        category: "EXPORT",
        subjectPatientId: existing.patientId,
        target: req.params.id,
        details: { byteSize: Buffer.byteLength(plaintext) },
      });
      return updated;
    });
    res.json(request);
  }),
);

/**
 * Approve: dual control. The approver must differ from the requester and an
 * active artifact must exist. Requires a fresh step-up.
 */
dsarRouter.post(
  "/dsar/:id/approve",
  authenticate,
  requireCapability("dsar:manage"),
  requireRecentStepUp,
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const request = await withTenantRepos(ctx, async (repos) => {
      const existing = await repos.dsar.findById(ctx.tenantId, req.params.id);
      if (!existing) throw new ApiError(404, "NOT_FOUND", "Request not found");
      if (!existing.preparedAt) {
        throw new ApiError(409, "ARTIFACT_UNAVAILABLE", "Prepare the encrypted artifact before approval");
      }
      if (existing.artifactExpiresAt && new Date(existing.artifactExpiresAt) < new Date()) {
        throw new ApiError(409, "ARTIFACT_UNAVAILABLE", "The prepared artifact has expired; prepare again");
      }
      if (existing.createdById === ctx.actorId) {
        throw new ApiError(
          422,
          "UNPROCESSABLE",
          "Dual control: the approver must differ from the requester",
        );
      }
      const approved = await repos.dsar.approve(ctx, req.params.id);
      if (approved) {
        await repos.audit.append(ctx, {
          action: "DSAR_ARTIFACT_APPROVED",
          category: "EXPORT",
          subjectPatientId: approved.patientId,
          target: req.params.id,
        });
      }
      return approved;
    });
    res.json(request);
  }),
);

/**
 * Release: issue a one-time download token (15 min). Only its SHA-256 hash
 * is stored. Requires approval and a fresh step-up.
 */
dsarRouter.post(
  "/dsar/:id/release",
  authenticate,
  requireCapability("dsar:manage"),
  requireRecentStepUp,
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const release = await withTenantRepos(ctx, async (repos) => {
      const existing = await repos.dsar.findById(ctx.tenantId, req.params.id);
      if (!existing) throw new ApiError(404, "NOT_FOUND", "Request not found");
      if (!existing.approvedAt) {
        throw new ApiError(
          403,
          "DSAR_APPROVAL_REQUIRED",
          "Release requires a recorded dual-control approval",
        );
      }
      const artifact = await repos.dsar.activeArtifact(ctx.tenantId, req.params.id);
      if (!artifact) {
        throw new ApiError(409, "ARTIFACT_UNAVAILABLE", "No active artifact; prepare the export again");
      }
      const issued = await repos.dsar.issueDownloadToken(ctx, req.params.id);
      await repos.audit.append(ctx, {
        action: "DSAR_DOWNLOAD_ISSUED",
        category: "EXPORT",
        subjectPatientId: existing.patientId,
        target: req.params.id,
      });
      return issued;
    });
    res.json({
      token: release.token,
      expiresAt: release.expiresAt.toISOString(),
      downloadPath: `/api/v1/dsar/${req.params.id}/download?token=${encodeURIComponent(release.token)}`,
    });
  }),
);

/**
 * Download: single-use, audited. The CAS consumption makes token replay
 * impossible; the artifact is decrypted only for this response and its
 * integrity is re-checked against the stored SHA-256.
 */
dsarRouter.get(
  "/dsar/:id/download",
  authenticate,
  requireCapability("dsar:manage"),
  exportLimiter,
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const token = typeof req.query.token === "string" ? req.query.token : "";
    if (!token) throw new ApiError(400, "VALIDATION_FAILED", "A download token is required");
    const plaintext = await withTenantRepos(ctx, async (repos) => {
      const result = await repos.dsar.consumeDownloadToken(ctx, req.params.id, token);
      if (!result) {
        throw new ApiError(410, "UNPROCESSABLE", "This download token is invalid, expired or already used");
      }
      const json = decryptPHI(result.ciphertext);
      if (!json || sha256(json) !== result.contentHash) {
        throw new ApiError(422, "UNPROCESSABLE", "The artifact failed its integrity check");
      }
      const request = await repos.dsar.findById(ctx.tenantId, req.params.id);
      await repos.audit.append(ctx, {
        action: "DSAR_DOWNLOAD_COMPLETED",
        category: "EXPORT",
        subjectPatientId: request?.patientId,
        target: req.params.id,
      });
      return json;
    });
    res.setHeader("Content-Disposition", `attachment; filename="dsar-export-${req.params.id}.json"`);
    res.type("application/json").send(plaintext);
  }),
);
