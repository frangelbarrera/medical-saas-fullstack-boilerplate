/**
 * Consultation routes (PHI): /api/patients/:id/consultations
 */
import { Router } from "express";
import { AuthenticatedRequest, authenticateToken, requireRole, assertClinicOwnership } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { schemas } from "../schemas/index.js";
import { mockPatients, mockConsultations } from "../config.js";
import { generateRandomId } from "../utils/crypto.js";
import { appendAuditLog } from "../utils/audit.js";

export const consultationsRouter = Router();

consultationsRouter.get(
  "/api/patients/:id/consultations",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      const patient = mockPatients.find((p) => p.id === req.params.id);
      if (!patient) return res.status(404).json({ error: "Patient not found" });
      if (!assertClinicOwnership(patient.clinic_id, req.user!.clinicId)) {
        return res.status(404).json({ error: "Patient not found" });
      }
      const filtered = mockConsultations.filter((c) => c.patient_id === req.params.id);
      res.json(filtered);
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

consultationsRouter.post(
  "/api/patients/:id/consultations",
  authenticateToken,
  requireRole("ADMIN", "DOCTOR"),
  validateBody(schemas.consultationCreate),
  async (req: AuthenticatedRequest, res) => {
    const { date, reason, evolution, vital_signs, diagnosis_cie10, prescription, doctorId, doctorName } = req.body;
    const clinicId = req.user!.clinicId;
    const id = generateRandomId("cons");

    try {
      const patient = mockPatients.find((p) => p.id === req.params.id);
      if (!patient) return res.status(404).json({ error: "Patient not found" });
      if (!assertClinicOwnership(patient.clinic_id, clinicId)) {
        return res.status(404).json({ error: "Patient not found" });
      }
      const newCons = {
        id,
        patient_id: req.params.id,
        date,
        reason,
        evolution,
        vital_signs,
        diagnosis_cie10,
        prescription,
        clinic_id: clinicId,
        doctor_id: doctorId,
        doctor_name: doctorName,
      };
      mockConsultations.push(newCons);
      appendAuditLog({
        id: generateRandomId("log"),
        clinic_id: clinicId,
        user_id: req.user!.id,
        user_name: req.user!.name,
        action: "CONSULTATION_CREATE",
        target: id,
        type: "PHI",
        details: { patientId: req.params.id, diagnosis: diagnosis_cie10 },
      });
      res.json(newCons);
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  },
);
