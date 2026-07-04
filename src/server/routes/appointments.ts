/**
 * Appointment routes.
 */
import { Router } from "express";
import { AuthenticatedRequest, authenticateToken, assertClinicOwnership } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { schemas } from "../schemas/index.js";
import { mockAppointments } from "../config.js";
import { generateRandomId } from "../utils/crypto.js";
import { appendAuditLog } from "../utils/audit.js";

export const appointmentsRouter = Router();

appointmentsRouter.get("/api/appointments", authenticateToken, async (req: AuthenticatedRequest, res) => {
  const clinicId = req.user!.clinicId;
  const doctorId = req.query.doctorId as string | undefined;
  const start = req.query.start as string | undefined;
  const end = req.query.end as string | undefined;
  try {
    const filtered = mockAppointments.filter((a) => {
      const matchClinic = a.clinic_id === clinicId;
      const matchDoctor = !doctorId || a.doctor_id === doctorId;
      const apptDate = new Date(a.date_time);
      const matchStart = !start || apptDate >= new Date(start);
      const matchEnd = !end || apptDate <= new Date(end);
      return matchClinic && matchDoctor && matchStart && matchEnd;
    });
    res.json(filtered);
  } catch (err: any) {
    res.status(500).json({ error: "Internal server error" });
  }
});

appointmentsRouter.post(
  "/api/appointments",
  authenticateToken,
  validateBody(schemas.appointmentCreate),
  async (req: AuthenticatedRequest, res) => {
    const { patientName, patientId, type, duration, reason, dateTime, doctorId, doctorName } = req.body;
    const clinicId = req.user!.clinicId;
    const id = generateRandomId("appt");

    try {
      const newAppt = {
        id,
        patient_name: patientName,
        patient_id: patientId,
        type,
        duration,
        reason,
        date_time: dateTime,
        clinic_id: clinicId,
        doctor_id: doctorId,
        doctor_name: doctorName,
        created_at: new Date().toISOString(),
      };
      mockAppointments.push(newAppt);
      appendAuditLog({
        id: generateRandomId("log"),
        clinic_id: clinicId,
        user_id: req.user!.id,
        user_name: req.user!.name,
        action: "APPOINTMENT_CREATE",
        target: id,
        type: "SCHEDULE",
        details: { patientId, doctorId, dateTime },
      });
      res.json(newAppt);
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

appointmentsRouter.delete("/api/appointments/:id", authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const idx = mockAppointments.findIndex((a) => a.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: "Appointment not found" });
    if (!assertClinicOwnership(mockAppointments[idx].clinic_id, req.user!.clinicId)) {
      return res.status(404).json({ error: "Appointment not found" });
    }
    mockAppointments.splice(idx, 1);
    appendAuditLog({
      id: generateRandomId("log"),
      clinic_id: req.user!.clinicId,
      user_id: req.user!.id,
      user_name: req.user!.name,
      action: "APPOINTMENT_DELETE",
      target: req.params.id,
      type: "SCHEDULE",
      details: {},
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: "Internal server error" });
  }
});
