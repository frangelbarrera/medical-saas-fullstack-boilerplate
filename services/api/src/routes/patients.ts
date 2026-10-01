/**
 * Patient routes: server-side search, detail with PHI, lifecycle, consents.
 */
import { Router } from "express";
import {
  patientCreate,
  patientUpdate,
  patientSearchQuery,
  consentUpsert,
  patientIdentifierInput,
} from "@medical/contracts";
import { withTenantRepos } from "@medical/data";
import { assertPatientScope } from "@medical/domain";
import { asyncHandler, ApiError } from "../middleware/errors.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import { authenticate, requireCapability as capabilityGate, type AuthedRequest } from "../middleware/auth.js";

export const patientsRouter = Router();

patientsRouter.get(
  "/patients",
  authenticate,
  capabilityGate("patients:read"),
  validateQuery(patientSearchQuery),
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    assertPatientScope(ctx, ctx.selfPatientId ?? "");
    const q = (req as typeof req & { validatedQuery: ReturnType<typeof patientSearchQuery.parse> }).validatedQuery;
    const result = await withTenantRepos(ctx, (repos) =>
      repos.patients.search(ctx.tenantId, q),
    );
    // Portal users only ever see their own record in the directory.
    res.json(
      ctx.selfPatientId
        ? { ...result, items: result.items.filter((p) => p.id === ctx.selfPatientId) }
        : result,
    );
  }),
);

patientsRouter.post(
  "/patients",
  authenticate,
  capabilityGate("patients:write"),
  validateBody(patientCreate),
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const input = req.body as ReturnType<typeof patientCreate.parse>;
    const created = await withTenantRepos(ctx, async (repos) => {
      let patient;
      try {
        patient = await repos.patients.create(ctx.tenantId, input);
      } catch (err) {
        if (err instanceof Error && err.message === "DUPLICATE_IDENTIFIER") {
          throw new ApiError(
            409,
            "CONFLICT",
            "A patient with this identifier already exists",
            "The identifier is already registered in this clinic",
          );
        }
        throw err;
      }
      await repos.audit.append(ctx, {
        action: "PATIENT_CREATED",
        category: "PHI",
        subjectPatientId: patient.id,
        target: patient.id,
        details: { internalRef: patient.internalRef },
      });
      return patient;
    });
    res.status(201).json(created);
  }),
);

patientsRouter.get(
  "/patients/:id",
  authenticate,
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const id = req.params.id;
    // Portal users can read their own record; staff needs patients:read.
    if (!ctx.selfPatientId) {
      if (!ctx.capabilities.includes("patients:read")) {
        throw new ApiError(403, "FORBIDDEN", "Missing capability: patients:read");
      }
    }
    assertPatientScope(ctx, id);

    const result = await withTenantRepos(ctx, (repos) =>
      repos.patients.findById(ctx.tenantId, id),
    );
    if (!result) throw new ApiError(404, "NOT_FOUND", "Patient not found");

    await withTenantRepos(ctx, (repos) =>
      repos.audit.append(ctx, {
        action: "PATIENT_VIEWED",
        category: "PHI",
        subjectPatientId: id,
        target: id,
        purpose: "TREATMENT",
      }),
    );
    res.json(result);
  }),
);

patientsRouter.put(
  "/patients/:id",
  authenticate,
  capabilityGate("patients:write"),
  assertSelfOrStaff,
  validateBody(patientUpdate),
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const updated = await withTenantRepos(ctx, async (repos) => {
      const patient = await repos.patients.update(ctx.tenantId, req.params.id, req.body);
      if (!patient) return null;
      await repos.audit.append(ctx, {
        action: "PATIENT_UPDATED",
        category: "PHI",
        subjectPatientId: patient.id,
        target: patient.id,
        details: { fields: Object.keys(req.body as object) },
      });
      return patient;
    });
    if (!updated) throw new ApiError(404, "NOT_FOUND", "Patient not found");
    res.json(updated);
  }),
);

patientsRouter.post(
  "/patients/:id/archive",
  authenticate,
  capabilityGate("admin:clinic"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const archived = await withTenantRepos(ctx, async (repos) => {
      const ok = await repos.patients.archive(ctx.tenantId, req.params.id);
      if (ok) {
        await repos.audit.append(ctx, {
          action: "PATIENT_ARCHIVED",
          category: "PHI",
          subjectPatientId: req.params.id,
          target: req.params.id,
        });
      }
      return ok;
    });
    if (!archived) throw new ApiError(404, "NOT_FOUND", "Patient not found");
    res.json({ ok: true });
  }),
);

patientsRouter.put(
  "/patients/:id/consents",
  authenticate,
  capabilityGate("patients:write"),
  assertSelfOrStaff,
  validateBody(consentUpsert),
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const id = req.params.id;
    await withTenantRepos(ctx, async (repos) => {
      const patient = await repos.patients.findById(ctx.tenantId, id);
      if (!patient) throw new ApiError(404, "NOT_FOUND", "Patient not found");
      await repos.patients.upsertConsent(ctx.tenantId, id, {
        ...req.body,
        recordedById: ctx.actorId,
      });
      await repos.audit.append(ctx, {
        action: "CONSENT_UPDATED",
        category: "PHI",
        subjectPatientId: id,
        target: id,
        details: { type: (req.body as { type: string }).type, status: (req.body as { status: string }).status },
      });
    });
    res.json({ ok: true });
  }),
);

patientsRouter.post(
  "/patients/:id/identifiers",
  authenticate,
  capabilityGate("patients:write"),
  assertSelfOrStaff,
  validateBody(patientIdentifierInput),
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const id = req.params.id;
    const added = await withTenantRepos(ctx, async (repos) => {
      const ok = await repos.patients.addIdentifier(ctx.tenantId, id, req.body);
      if (ok) {
        await repos.audit.append(ctx, {
          action: "PATIENT_UPDATED",
          category: "PHI",
          subjectPatientId: id,
          target: id,
          details: { fields: ["identifiers"] },
        });
      }
      return ok;
    });
    if (!added) throw new ApiError(404, "NOT_FOUND", "Patient not found");
    res.status(201).json({ ok: true });
  }),
);

function assertSelfOrStaff(req: AuthedRequest, _res: unknown, next: (err?: unknown) => void): void {
  const ctx = req.ctx!;
  if (ctx.selfPatientId && ctx.selfPatientId !== req.params.id) {
    return next(new ApiError(404, "NOT_FOUND", "Patient not found"));
  }
  next();
}
