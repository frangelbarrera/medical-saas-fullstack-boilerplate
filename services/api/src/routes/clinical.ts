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
  careTeamAssign,
} from "@medical/contracts";
import { withTenantRepos } from "@medical/data";
import { assertTransition, canEditContent, assertPatientScope } from "@medical/domain";
import { asyncHandler, ApiError } from "../middleware/errors.js";
import { validateBody } from "../middleware/validate.js";
import { authenticate, requireCapability, type AuthedRequest } from "../middleware/auth.js";
import { assertClinicalAccess } from "../lib/access.js";

export const clinicalRouter = Router();

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
      await assertClinicalAccess(ctx, repos, input.patientId);
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
    const encounter = await withTenantRepos(ctx, async (repos) => {
      const found = await repos.clinical.findById(ctx.tenantId, req.params.id);
      if (!found) throw new ApiError(404, "NOT_FOUND", "Encounter not found");
      assertPatientScope(ctx, found.patientId);
      await assertClinicalAccess(ctx, repos, found.patientId);
      await repos.audit.append(ctx, {
        action: "ENCOUNTER_VIEWED",
        category: "CLINICAL",
        subjectPatientId: found.patientId,
        target: found.id,
      });
      return found;
    });
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
      await assertClinicalAccess(ctx, repos, existing.patientId);
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
      await assertClinicalAccess(ctx, repos, existing.patientId);
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
      await assertClinicalAccess(ctx, repos, existing.patientId);
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
    const versions = await withTenantRepos(ctx, async (repos) => {
      const encounter = await repos.clinical.findById(ctx.tenantId, req.params.id);
      if (!encounter) throw new ApiError(404, "NOT_FOUND", "Encounter not found");
      assertPatientScope(ctx, encounter.patientId);
      await assertClinicalAccess(ctx, repos, encounter.patientId);
      return repos.clinical.versions(ctx.tenantId, req.params.id);
    });
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
    const problems = await withTenantRepos(ctx, async (repos) => {
      await assertClinicalAccess(ctx, repos, req.params.patientId);
      return repos.clinical.listProblems(ctx.tenantId, req.params.patientId);
    });
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
      const patient = await repos.patients.exists(ctx.tenantId, (req.body as { patientId: string }).patientId);
      if (!patient) throw new ApiError(404, "NOT_FOUND", "Patient not found");
      await assertClinicalAccess(ctx, repos, (req.body as { patientId: string }).patientId);
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
      const patientId = await repos.clinical.findProblemPatient(ctx.tenantId, req.params.id);
      if (!patientId) throw new ApiError(404, "NOT_FOUND", "Problem not found");
      await assertClinicalAccess(ctx, repos, patientId);
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
    const allergies = await withTenantRepos(ctx, async (repos) => {
      await assertClinicalAccess(ctx, repos, req.params.patientId);
      return repos.clinical.listAllergies(ctx.tenantId, req.params.patientId);
    });
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
      const patient = await repos.patients.exists(ctx.tenantId, (req.body as { patientId: string }).patientId);
      if (!patient) throw new ApiError(404, "NOT_FOUND", "Patient not found");
      await assertClinicalAccess(ctx, repos, (req.body as { patientId: string }).patientId);
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
    const medications = await withTenantRepos(ctx, async (repos) => {
      await assertClinicalAccess(ctx, repos, req.params.patientId);
      return repos.clinical.listMedications(ctx.tenantId, req.params.patientId);
    });
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
      const patient = await repos.patients.exists(ctx.tenantId, (req.body as { patientId: string }).patientId);
      if (!patient) throw new ApiError(404, "NOT_FOUND", "Patient not found");
      await assertClinicalAccess(ctx, repos, (req.body as { patientId: string }).patientId);
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
      const patientId = await repos.clinical.findMedicationPatient(ctx.tenantId, req.params.id);
      if (!patientId) throw new ApiError(404, "NOT_FOUND", "Medication order not found");
      await assertClinicalAccess(ctx, repos, patientId);
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
    const observations = await withTenantRepos(ctx, async (repos) => {
      await assertClinicalAccess(ctx, repos, req.params.patientId);
      return repos.clinical.listObservations(ctx.tenantId, req.params.patientId);
    });
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
      const patient = await repos.patients.exists(ctx.tenantId, (req.body as { patientId: string }).patientId);
      if (!patient) throw new ApiError(404, "NOT_FOUND", "Patient not found");
      await assertClinicalAccess(ctx, repos, (req.body as { patientId: string }).patientId);
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

/** Anti-abuse caps (BG-001): concurrent windows and grants per 24h. */
const BG_ACTIVE_LIMIT = Number(process.env.BREAK_GLASS_ACTIVE_LIMIT ?? 2);
const BG_DAILY_LIMIT = Number(process.env.BREAK_GLASS_DAILY_LIMIT ?? 10);
const BG_ALERT_THRESHOLD = 3;

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

      // BG-001: an actor cannot keep many emergency windows open at once,
      // and cannot hammer the mechanism all day.
      const active = await repos.clinical.countActiveForActor(ctx.tenantId, ctx.actorId);
      if (active >= BG_ACTIVE_LIMIT) {
        await repos.audit.append(ctx, {
          action: "BREAK_GLASS_LIMIT_BLOCKED",
          category: "PHI",
          subjectPatientId: patientId,
          target: patientId,
          purpose: "EMERGENCY",
          details: { limit: "ACTIVE_WINDOWS", active },
        });
        throw new ApiError(429, "RATE_LIMITED", "Emergency access windows are already open; close or let them expire first");
      }
      const since = new Date(Date.now() - 24 * 3600 * 1000);
      const recent = await repos.clinical.countRecentForActor(ctx.tenantId, ctx.actorId, since);
      if (recent >= BG_DAILY_LIMIT) {
        await repos.audit.append(ctx, {
          action: "BREAK_GLASS_LIMIT_BLOCKED",
          category: "PHI",
          subjectPatientId: patientId,
          target: patientId,
          purpose: "EMERGENCY",
          details: { limit: "DAILY_RATE", recent },
        });
        throw new ApiError(429, "RATE_LIMITED", "Daily emergency access limit reached; the privacy owner has been notified");
      }

      const window = await repos.clinical.breakGlass(ctx, patientId, reason);
      const repeatedUse = recent + 1 >= BG_ALERT_THRESHOLD;
      await repos.audit.append(ctx, {
        action: "BREAK_GLASS_USED",
        category: "PHI",
        subjectPatientId: patientId,
        target: patientId,
        purpose: "EMERGENCY",
        // Length only: the full justification lives in the protected row.
        details: { reasonLength: reason.length, accessId: window.id, repeatedUse },
      });
      // The privacy owner (administrator role) is notified immediately, and
      // repeated use of the mechanism raises its own signal.
      await repos.messaging.notifyClinicAdmins(ctx.tenantId, {
        category: "BREAK_GLASS",
        subject: repeatedUse ? "Repeated emergency access" : "Emergency access opened",
        body: repeatedUse
          ? "An administrator has opened multiple emergency access windows in the last 24 hours. Post-use review is required."
          : "An administrator opened an emergency access window. Post-use review is required.",
      });
      return { id: window.id, expiresAt: window.expiresAt.toISOString() };
    });
    res.json({ ok: true, accessId: granted.id, expiresInMinutes: 30, expiresAt: granted.expiresAt });
  }),
);

/** Immediate revocation of the actor's own open window (BG-001). */
clinicalRouter.delete(
  "/break-glass",
  authenticate,
  requireCapability("clinical:break_glass"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const revoked = await withTenantRepos(ctx, async (repos) => {
      const count = await repos.clinical.revokeActive(ctx.tenantId, ctx.actorId);
      if (count > 0) {
        await repos.audit.append(ctx, {
          action: "BREAK_GLASS_REVOKED",
          category: "PHI",
          details: { windowsClosed: count },
        });
      }
      return count;
    });
    res.json({ ok: true, windowsClosed: revoked });
  }),
);

/** Privacy owner worklist: emergency accesses awaiting review (BG-001). */
clinicalRouter.get(
  "/break-glass/pending-review",
  authenticate,
  requireCapability("admin:clinic"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const items = await withTenantRepos(ctx, (repos) => repos.clinical.listPendingReview(ctx.tenantId));
    res.json({ items });
  }),
);

clinicalRouter.post(
  "/break-glass/:accessId/review",
  authenticate,
  requireCapability("admin:clinic"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const ok = await withTenantRepos(ctx, async (repos) => {
      const done = await repos.clinical.markReviewed(ctx.tenantId, req.params.accessId, ctx.actorId);
      if (done) {
        await repos.audit.append(ctx, {
          action: "BREAK_GLASS_REVIEWED",
          category: "ADMIN",
          target: req.params.accessId,
          details: { reviewerId: ctx.actorId },
        });
      }
      return done;
    });
    if (!ok) throw new ApiError(404, "NOT_FOUND", "Emergency access record not found");
    res.json({ ok: true });
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

// ------------------------------------------------------------------ care team

/**
 * Care-team management (CLIN-004). Reading the team is allowed for the team
 * itself and for administrators; assignment needs admin:users or an active
 * treating relationship; ending a membership is admin-only (or self-release).
 * Every transition is audited.
 */
clinicalRouter.get(
  "/patients/:patientId/care-team",
  authenticate,
  requireCapability("patients:read"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    assertPatientScope(ctx, req.params.patientId);
    const items = await withTenantRepos(ctx, async (repos) => {
      if (ctx.actorRole !== "ADMIN") {
        await assertClinicalAccess(ctx, repos, req.params.patientId);
      }
      return repos.clinical.listCareTeam(ctx.tenantId, req.params.patientId);
    });
    res.json({ items });
  }),
);

clinicalRouter.post(
  "/patients/:patientId/care-team",
  authenticate,
  validateBody(careTeamAssign),
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const input = req.body as ReturnType<typeof careTeamAssign.parse>;
    const membershipId = await withTenantRepos(ctx, async (repos) => {
      const exists = await repos.patients.exists(ctx.tenantId, req.params.patientId);
      if (!exists) throw new ApiError(404, "NOT_FOUND", "Patient not found");
      const isTreating =
        ctx.actorRole === "DOCTOR" &&
        (await repos.clinical.hasCareRelationship(ctx.tenantId, ctx.actorId, req.params.patientId));
      if (!ctx.capabilities.includes("admin:users") && !isTreating) {
        throw new ApiError(403, "FORBIDDEN", "Only administrators or treating clinicians manage the care team");
      }
      const target = await repos.users.findById(ctx.tenantId, input.userId);
      if (!target || !target.isActive) throw new ApiError(404, "NOT_FOUND", "Staff member not found");
      if (target.patientId) {
        throw new ApiError(422, "UNPROCESSABLE", "Portal users cannot join a care team");
      }
      const id = await repos.clinical.assignCareTeamMember(ctx, req.params.patientId, input.userId, input.memberRole);
      await repos.audit.append(ctx, {
        action: "CARE_TEAM_ASSIGNED",
        category: "CLINICAL",
        subjectPatientId: req.params.patientId,
        target: id,
        details: { userId: input.userId, memberRole: input.memberRole },
      });
      return id;
    });
    res.status(201).json({ id: membershipId });
  }),
);

clinicalRouter.delete(
  "/patients/:patientId/care-team/:membershipId",
  authenticate,
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const ended = await withTenantRepos(ctx, async (repos) => {
      const team = await repos.clinical.listCareTeam(ctx.tenantId, req.params.patientId);
      const membership = team.find((m) => m.id === req.params.membershipId);
      if (!membership) throw new ApiError(404, "NOT_FOUND", "Care-team membership not found");
      const selfRelease = membership.userId === ctx.actorId;
      if (!ctx.capabilities.includes("admin:users") && !selfRelease) {
        throw new ApiError(403, "FORBIDDEN", "Only administrators or the member themselves end a membership");
      }
      const ok = await repos.clinical.endCareTeamMember(ctx.tenantId, req.params.patientId, req.params.membershipId);
      if (ok) {
        await repos.audit.append(ctx, {
          action: "CARE_TEAM_ENDED",
          category: "CLINICAL",
          subjectPatientId: req.params.patientId,
          target: req.params.membershipId,
          details: { userId: membership.userId },
        });
      }
      return ok;
    });
    res.json({ ok: ended });
  }),
);
