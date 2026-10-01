/**
 * Clinical routes: encounters lifecycle (draft -> review -> sign -> amend),
 * problems / allergies / medications / observations, break-glass, timeline.
 */
import { Router } from "express";
import { z } from "zod";
import {
  encounterCreate,
  encounterUpdate,
  observationInput,
  problemInput,
  problemStatusChange,
  allergyInput,
  medicationOrderInput,
  medicationStatusChange,
  breakGlassRequest,
} from "@medical/contracts";
import { withTenantRepos } from "@medical/data";
import { assertTransition, canEditContent, assertPatientScope } from "@medical/domain";
import { asyncHandler, ApiError } from "../middleware/errors.js";
import { validateBody } from "../middleware/validate.js";
import { authenticate, requireCapability, type AuthedRequest } from "../middleware/auth.js";

export const clinicalRouter = Router();

/**
 * Policy (CLIN-003): administrators can reach clinical records, but only
 * through a justified, audited break-glass window. Doctors access through
 * their care relationship; the enforcement here is server-side, not cosmetic.
 */
const assertClinicalAccess = async (
  ctx: NonNullable<AuthedRequest["ctx"]>,
  repos: import("@medical/data").Repositories,
  patientId: string,
): Promise<void> => {
  if (ctx.actorRole !== "ADMIN") return;
  const granted = await repos.clinical.hasActiveBreakGlass(ctx.tenantId, ctx.actorId, patientId);
  if (!granted) {
    throw new ApiError(
      403,
      "BREAK_GLASS_REQUIRED",
      "This clinical record requires a justified break-glass access",
      "Provide a reason to open the record under emergency access. The access is logged and expires after 30 minutes.",
    );
  }
};

/** Patients (portal) can only read their own clinical data. */
const scopeFilter = <T extends { patientId?: string }>(ctx: AuthedRequest["ctx"], items: T[]): T[] =>
  ctx?.selfPatientId ? items.filter((i) => i.patientId === ctx.selfPatientId) : items;

clinicalRouter.get(
  "/patients/:patientId/encounters",
  authenticate,
  requireCapability("clinical:read"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    assertPatientScope(ctx, req.params.patientId);
    const encounters = await withTenantRepos(ctx, async (repos) => {
      await assertClinicalAccess(ctx, repos, req.params.patientId);
      return repos.clinical.listForPatient(ctx.tenantId, req.params.patientId);
    });
    res.json({ items: scopeFilter(ctx, encounters) });
  }),
);

clinicalRouter.post(
  "/encounters",
  authenticate,
  requireCapability("clinical:write"),
  validateBody(encounterCreate),
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const input = req.body as ReturnType<typeof encounterCreate.parse>;
    const created = await withTenantRepos(ctx, async (repos) => {
      const patient = await repos.patients.findById(ctx.tenantId, input.patientId);
      if (!patient) throw new ApiError(404, "NOT_FOUND", "Patient not found");
      const encounter = await repos.clinical.create(
        ctx,
        input,
      );
      await repos.audit.append(ctx, {
        action: "ENCOUNTER_CREATED",
        category: "CLINICAL",
        subjectPatientId: encounter.patientId,
        target: encounter.id,
      });
      return encounter;
    });
    res.status(201).json(created);
  }),
);

clinicalRouter.get(
  "/encounters/:id",
  authenticate,
  requireCapability("clinical:read"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const encounter = await withTenantRepos(ctx, (repos) =>
      repos.clinical.findById(ctx.tenantId, req.params.id),
    );
    if (!encounter) throw new ApiError(404, "NOT_FOUND", "Encounter not found");
    assertPatientScope(ctx, encounter.patientId);
    await withTenantRepos(ctx, (repos) =>
      repos.audit.append(ctx, {
        action: "ENCOUNTER_VIEWED",
        category: "CLINICAL",
        subjectPatientId: encounter.patientId,
        target: encounter.id,
      }),
    );
    res.json(encounter);
  }),
);

clinicalRouter.put(
  "/encounters/:id",
  authenticate,
  requireCapability("clinical:write"),
  validateBody(encounterUpdate),
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const updated = await withTenantRepos(ctx, async (repos) => {
      const existing = await repos.clinical.findById(ctx.tenantId, req.params.id);
      if (!existing) throw new ApiError(404, "NOT_FOUND", "Encounter not found");
      if (!canEditContent(existing.status)) {
        throw new ApiError(409, "INVALID_STATE_TRANSITION", "Signed notes cannot be edited; create an amendment instead");
      }
      const encounter = await repos.clinical.updateContent(ctx, req.params.id, req.body);
      await repos.audit.append(ctx, {
        action: "ENCOUNTER_UPDATED",
        category: "CLINICAL",
        subjectPatientId: encounter?.patientId,
        target: req.params.id,
        details: { version: encounter?.currentVersion },
      });
      return encounter;
    });
    if (!updated) throw new ApiError(404, "NOT_FOUND", "Encounter not found");
    res.json(updated);
  }),
);

const transitionTo = (target: "DRAFT" | "IN_REVIEW" | "SIGNED") =>
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const result = await withTenantRepos(ctx, async (repos) => {
      const existing = await repos.clinical.findById(ctx.tenantId, req.params.id);
      if (!existing) throw new ApiError(404, "NOT_FOUND", "Encounter not found");
      try {
        assertTransition(existing.status, target);
      } catch {
        throw new ApiError(409, "INVALID_STATE_TRANSITION", `Cannot move a ${existing.status} note to ${target}`);
      }
      const encounter = await repos.clinical.transition(ctx, req.params.id, target);
      await repos.audit.append(ctx, {
        action: target === "SIGNED" ? "ENCOUNTER_SIGNED" : target === "IN_REVIEW" ? "ENCOUNTER_SUBMITTED" : "ENCOUNTER_UPDATED",
        category: "CLINICAL",
        subjectPatientId: encounter?.patientId,
        target: req.params.id,
        actorId: ctx.actorId,
      });
      return encounter;
    });
    if (!result) throw new ApiError(404, "NOT_FOUND", "Encounter not found");
    res.json(result);
  });

clinicalRouter.post("/encounters/:id/submit", authenticate, requireCapability("clinical:write"), transitionTo("IN_REVIEW"));
clinicalRouter.post("/encounters/:id/sign", authenticate, requireCapability("clinical:sign"), transitionTo("SIGNED"));

clinicalRouter.post(
  "/encounters/:id/amend",
  authenticate,
  requireCapability("clinical:write"),
  validateBody(
    z.object({ reason: z.string().min(10, "A specific reason is required").max(500) }),
  ),
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const { reason } = req.body as { reason: string };
    const amended = await withTenantRepos(ctx, async (repos) => {
      const existing = await repos.clinical.findById(ctx.tenantId, req.params.id);
      if (!existing) throw new ApiError(404, "NOT_FOUND", "Encounter not found");
      if (existing.status !== "SIGNED" && existing.status !== "AMENDED") {
        throw new ApiError(409, "INVALID_STATE_TRANSITION", "Only signed notes can be amended");
      }
      const amendment = await repos.clinical.amend(
        ctx,
        req.params.id,
        reason,
      );
      await repos.audit.append(ctx, {
        action: "ENCOUNTER_AMENDED",
        category: "CLINICAL",
        subjectPatientId: amendment?.patientId,
        target: amendment?.id,
        details: { amendedFrom: req.params.id },
      });
      return amendment;
    });
    if (!amended) throw new ApiError(404, "NOT_FOUND", "Encounter not found");
    res.status(201).json(amended);
  }),
);

clinicalRouter.get(
  "/encounters/:id/versions",
  authenticate,
  requireCapability("clinical:read"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const versions = await withTenantRepos(ctx, (repos) =>
      repos.clinical.versions(ctx.tenantId, req.params.id),
    );
    res.json({ items: versions });
  }),
);

// ------------------------------------------------------------------ problems

clinicalRouter.get(
  "/patients/:patientId/problems",
  authenticate,
  requireCapability("clinical:read"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    assertPatientScope(ctx, req.params.patientId);
    const problems = await withTenantRepos(ctx, (repos) =>
      repos.clinical.listProblems(ctx.tenantId, req.params.patientId),
    );
    res.json({ items: problems });
  }),
);

clinicalRouter.post(
  "/problems",
  authenticate,
  requireCapability("clinical:write"),
  validateBody(problemInput),
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const created = await withTenantRepos(ctx, async (repos) => {
      const problem = await repos.clinical.addProblem(ctx, req.body);
      await repos.audit.append(ctx, {
        action: "PROBLEM_RECORDED",
        category: "CLINICAL",
        subjectPatientId: problem.patientId,
        target: problem.id,
        details: { code: problem.code },
      });
      return problem;
    });
    res.status(201).json(created);
  }),
);

clinicalRouter.patch(
  "/problems/:id/status",
  authenticate,
  requireCapability("clinical:write"),
  validateBody(problemStatusChange),
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const updated = await withTenantRepos(ctx, async (repos) => {
      const problem = await repos.clinical.setProblemStatus(ctx.tenantId, req.params.id, req.body.status);
      if (problem) {
        await repos.audit.append(ctx, {
          action: "PROBLEM_RECORDED",
          category: "CLINICAL",
          subjectPatientId: problem.patientId,
          target: problem.id,
          details: { status: problem.status },
        });
      }
      return problem;
    });
    if (!updated) throw new ApiError(404, "NOT_FOUND", "Problem not found");
    res.json(updated);
  }),
);

// ------------------------------------------------------------------ allergies

clinicalRouter.get(
  "/patients/:patientId/allergies",
  authenticate,
  requireCapability("clinical:read"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    assertPatientScope(ctx, req.params.patientId);
    const allergies = await withTenantRepos(ctx, (repos) =>
      repos.clinical.listAllergies(ctx.tenantId, req.params.patientId),
    );
    res.json({ items: allergies });
  }),
);

clinicalRouter.post(
  "/allergies",
  authenticate,
  requireCapability("clinical:write"),
  validateBody(allergyInput),
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const created = await withTenantRepos(ctx, async (repos) => {
      const allergy = await repos.clinical.addAllergy(ctx, req.body);
      await repos.audit.append(ctx, {
        action: "ALLERGY_RECORDED",
        category: "CLINICAL",
        subjectPatientId: allergy.patientId,
        target: allergy.id,
      });
      return allergy;
    });
    res.status(201).json(created);
  }),
);

// ---------------------------------------------------------------- medications

clinicalRouter.get(
  "/patients/:patientId/medications",
  authenticate,
  requireCapability("clinical:read"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    assertPatientScope(ctx, req.params.patientId);
    const medications = await withTenantRepos(ctx, (repos) =>
      repos.clinical.listMedications(ctx.tenantId, req.params.patientId),
    );
    res.json({ items: medications });
  }),
);

clinicalRouter.post(
  "/medications",
  authenticate,
  requireCapability("clinical:write"),
  validateBody(medicationOrderInput),
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const created = await withTenantRepos(ctx, async (repos) => {
      const order = await repos.clinical.addMedicationOrder(ctx, req.body);
      await repos.audit.append(ctx, {
        action: "MEDICATION_ORDERED",
        category: "CLINICAL",
        subjectPatientId: order.patientId,
        target: order.id,
        details: { medication: order.medicationName, status: order.status },
      });
      return order;
    });
    res.status(201).json(created);
  }),
);

clinicalRouter.patch(
  "/medications/:id/status",
  authenticate,
  requireCapability("clinical:write"),
  validateBody(medicationStatusChange),
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const updated = await withTenantRepos(ctx, async (repos) => {
      const order = await repos.clinical.setMedicationStatus(
        ctx.tenantId,
        req.params.id,
        req.body.status,
        ctx.actorId,
      );
      if (order) {
        await repos.audit.append(ctx, {
          action: "MEDICATION_STATUS_CHANGED",
          category: "CLINICAL",
          subjectPatientId: order.patientId,
          target: order.id,
          details: { status: order.status },
        });
      }
      return order;
    });
    if (!updated) throw new ApiError(404, "NOT_FOUND", "Medication order not found");
    res.json(updated);
  }),
);

// ---------------------------------------------------------------- observations

clinicalRouter.get(
  "/patients/:patientId/observations",
  authenticate,
  requireCapability("clinical:read"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    assertPatientScope(ctx, req.params.patientId);
    const observations = await withTenantRepos(ctx, (repos) =>
      repos.clinical.listObservations(ctx.tenantId, req.params.patientId),
    );
    res.json({ items: observations });
  }),
);

clinicalRouter.post(
  "/observations",
  authenticate,
  requireCapability("clinical:write"),
  validateBody(observationInput),
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const created = await withTenantRepos(ctx, async (repos) => {
      const observation = await repos.clinical.addObservation(ctx, req.body);
      await repos.audit.append(ctx, {
        action: "OBSERVATION_RECORDED",
        category: "CLINICAL",
        subjectPatientId: observation.patientId,
        target: observation.id,
        details: { type: observation.type },
      });
      return observation;
    });
    res.status(201).json(created);
  }),
);

// ---------------------------------------------------------------- break-glass

clinicalRouter.post(
  "/break-glass",
  authenticate,
  requireCapability("clinical:break_glass"),
  validateBody(breakGlassRequest),
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const { patientId, reason } = req.body as { patientId: string; reason: string };
    const granted = await withTenantRepos(ctx, async (repos) => {
      const exists = await repos.patients.exists(ctx.tenantId, patientId);
      if (!exists) throw new ApiError(404, "NOT_FOUND", "Patient not found");
      await repos.clinical.breakGlass(ctx, patientId, reason);
      await repos.audit.append(ctx, {
        action: "BREAK_GLASS_USED",
        category: "PHI",
        subjectPatientId: patientId,
        target: patientId,
        purpose: "EMERGENCY",
        details: { reasonLength: reason.length },
      });
      return true;
    });
    res.json({ ok: granted, expiresInMinutes: 30 });
  }),
);

// ------------------------------------------------------------ summary/timeline

clinicalRouter.get(
  "/patients/:patientId/summary",
  authenticate,
  requireCapability("clinical:read"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    assertPatientScope(ctx, req.params.patientId);
    const summary = await withTenantRepos(ctx, async (repos) => {
      await assertClinicalAccess(ctx, repos, req.params.patientId);
      return repos.clinical.summary(ctx.tenantId, req.params.patientId);
    });
    res.json(summary);
  }),
);

clinicalRouter.get(
  "/patients/:patientId/timeline",
  authenticate,
  requireCapability("clinical:read"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    assertPatientScope(ctx, req.params.patientId);
    const timeline = await withTenantRepos(ctx, async (repos) => {
      await assertClinicalAccess(ctx, repos, req.params.patientId);
      return repos.clinical.timeline(ctx.tenantId, req.params.patientId);
    });
    res.json({ items: timeline });
  }),
);
