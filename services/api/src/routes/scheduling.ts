/**
 * Scheduling routes: agenda, daybook overview, availability + self-booking slots.
 */
import { Router } from "express";
import { z } from "zod";
import {
  appointmentCreate,
  appointmentUpdate,
  appointmentStatusChange,
  availabilityRuleInput,
} from "@medical/contracts";
import { withTenantRepos } from "@medical/data";
import { asyncHandler, ApiError } from "../middleware/errors.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import { authenticate, requireCapability, type AuthedRequest } from "../middleware/auth.js";

export const schedulingRouter = Router();

const rangeQuery = z.object({
  from: z.string().datetime({ offset: true }),
  to: z.string().datetime({ offset: true }),
  doctorId: z.string().uuid().optional(),
});

/** Largest agenda window a client may request at once (SCH-001). */
const MAX_RANGE_DAYS = 62;

schedulingRouter.get(
  "/appointments",
  authenticate,
  requireCapability("schedule:read"),
  validateQuery(rangeQuery),
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const q = (req as typeof req & { validatedQuery: z.infer<typeof rangeQuery> }).validatedQuery;
    const from = new Date(q.from);
    const to = new Date(q.to);
    if (!(from < to)) {
      throw new ApiError(400, "VALIDATION_FAILED", "The range end must be after its start");
    }
    if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * 24 * 3600 * 1000) {
      throw new ApiError(400, "VALIDATION_FAILED", `The range must not exceed ${MAX_RANGE_DAYS} days`);
    }
    const appointments = await withTenantRepos(ctx, (repos) =>
      repos.scheduling.listRange(ctx.tenantId, from, to, q.doctorId),
    );
    res.json({ items: appointments });
  }),
);

schedulingRouter.post(
  "/appointments",
  authenticate,
  requireCapability("schedule:write"),
  validateBody(appointmentCreate),
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const input = req.body as ReturnType<typeof appointmentCreate.parse>;
    const created = await withTenantRepos(ctx, async (repos) => {
      // The practitioner must be an ACTIVE doctor of this clinic (SCH-004):
      // a known user id of a secretary, an inactive doctor or a user from
      // another clinic is never bookable.
      const doctor = await repos.users.findById(ctx.tenantId, input.doctorId);
      if (!doctor) throw new ApiError(404, "NOT_FOUND", "Doctor not found");
      if (doctor.role !== "DOCTOR" || !doctor.isActive) {
        throw new ApiError(422, "UNPROCESSABLE", "The selected practitioner is not an active doctor in this clinic");
      }
      // Overlap validation (audit: appointment with overlap check).
      const start = new Date(input.startTime);
      const end = new Date(start.getTime() + input.durationMinutes * 60000);
      const conflicts = await repos.scheduling.findConflicts(ctx.tenantId, input.doctorId, start, end);
      if (conflicts.length > 0) {
        throw new ApiError(409, "OVERLAPPING_APPOINTMENT", "The selected slot overlaps another appointment for this practitioner");
      }
      const patient = await repos.patients.findById(ctx.tenantId, input.patientId);
      if (!patient) throw new ApiError(404, "NOT_FOUND", "Patient not found");
      const appt = await repos.scheduling.create(ctx.tenantId, input);
      await repos.audit.append(ctx, {
        action: "APPOINTMENT_CREATED",
        category: "CLINICAL",
        subjectPatientId: appt.patientId,
        target: appt.id,
        details: { startTime: appt.startTime },
      });
      return appt;
    });
    res.status(201).json(created);
  }),
);

schedulingRouter.put(
  "/appointments/:id",
  authenticate,
  requireCapability("schedule:write"),
  validateBody(appointmentUpdate),
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const updated = await withTenantRepos(ctx, async (repos) => {
      const existing = await repos.scheduling.findById(ctx.tenantId, req.params.id);
      if (!existing) throw new ApiError(404, "NOT_FOUND", "Appointment not found");
      if (req.body.startTime || req.body.durationMinutes) {
        const start = req.body.startTime ? new Date(req.body.startTime) : new Date(existing.startTime);
        const duration =
          req.body.durationMinutes ??
          (new Date(existing.endTime).getTime() - new Date(existing.startTime).getTime()) / 60000;
        const end = new Date(start.getTime() + duration * 60000);
        const conflicts = await repos.scheduling.findConflicts(
          ctx.tenantId,
          existing.doctorId,
          start,
          end,
          existing.id,
        );
        if (conflicts.length > 0) {
          throw new ApiError(409, "OVERLAPPING_APPOINTMENT", "The selected slot overlaps another appointment for this practitioner");
        }
      }
      const appt = await repos.scheduling.update(ctx.tenantId, req.params.id, req.body);
      await repos.audit.append(ctx, {
        action: "APPOINTMENT_UPDATED",
        category: "CLINICAL",
        subjectPatientId: appt?.patientId,
        target: req.params.id,
      });
      return appt;
    });
    if (!updated) throw new ApiError(404, "NOT_FOUND", "Appointment not found");
    res.json(updated);
  }),
);

schedulingRouter.patch(
  "/appointments/:id/status",
  authenticate,
  requireCapability("schedule:write"),
  validateBody(appointmentStatusChange),
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const { status } = req.body as { status: string };
    const updated = await withTenantRepos(ctx, async (repos) => {
      const appt = await repos.scheduling.setStatus(ctx.tenantId, req.params.id, status);
      if (appt) {
        await repos.audit.append(ctx, {
          action: status === "CANCELLED" ? "APPOINTMENT_CANCELLED" : "APPOINTMENT_STATUS_CHANGED",
          category: "CLINICAL",
          subjectPatientId: appt.patientId,
          target: appt.id,
          details: { status },
        });
      }
      return appt;
    });
    if (!updated) throw new ApiError(404, "NOT_FOUND", "Appointment not found");
    res.json(updated);
  }),
);

schedulingRouter.get(
  "/overview/daybook",
  authenticate,
  requireCapability("schedule:read"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const overview = await withTenantRepos(ctx, (repos) => repos.scheduling.daybook(ctx.tenantId));
    res.json(overview);
  }),
);

schedulingRouter.get(
  "/doctors",
  authenticate,
  requireCapability("schedule:read"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const doctors = await withTenantRepos(ctx, (repos) => repos.users.listDoctors(ctx.tenantId));
    res.json({ items: doctors.map((d) => ({ id: d.id, fullName: d.fullName, role: d.role })) });
  }),
);

// ----- availability (self-booking, PAT-002) -----

schedulingRouter.put(
  "/availability",
  authenticate,
  requireCapability("admin:clinic"),
  validateBody(availabilityRuleInput),
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    await withTenantRepos(ctx, (repos) => repos.scheduling.setAvailabilityRule(ctx.tenantId, req.body));
    res.json({ ok: true });
  }),
);

schedulingRouter.get(
  "/availability",
  authenticate,
  requireCapability("schedule:read"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const rules = await withTenantRepos(ctx, (repos) => repos.scheduling.listAvailabilityRules(ctx.tenantId));
    res.json({
      items: rules.map((r) => ({
        id: r.id,
        doctorId: r.doctorId,
        doctorName: r.doctor.fullName,
        weekday: r.weekday,
        startMinute: r.startMinute,
        endMinute: r.endMinute,
      })),
    });
  }),
);

schedulingRouter.get(
  "/availability/slots",
  authenticate,
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const date = typeof req.query.date === "string" ? req.query.date : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new ApiError(400, "VALIDATION_FAILED", "date query parameter (YYYY-MM-DD) is required");
    }
    const slots = await withTenantRepos(ctx, (repos) => repos.scheduling.openSlots(ctx.tenantId, date));
    res.json({ items: slots });
  }),
);
