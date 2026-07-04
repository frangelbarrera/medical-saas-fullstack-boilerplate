/**
 * Consultation routes (PHI): /api/patients/:id/consultations
 */
import { Router } from "express";
import { AuthenticatedRequest, authenticateToken, requireRole, assertClinicOwnership } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { schemas } from "../schemas/index.js";
import { mockPatients, mockConsultations, mockUsers } from "../config.js";
import { generateRandomId } from "../utils/crypto.js";
import { appendAuditLog } from "../utils/audit.js";

export const consultationsRouter = Router();

// GET consultations requires ADMIN or DOCTOR (SECRETARY must not see clinical
// content like diagnoses, prescriptions, or evolution notes — HIPAA Minimum Necessary).
consultationsRouter.get(
  "/api/patients/:id/consultations",
  authenticateToken,
  requireRole("ADMIN", "DOCTOR"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const patient = mockPatients.find((p) => p.id === req.params.id);
      if (!patient) return res.status(404).json({ error: "Patient not found" });
      if (!assertClinicOwnership(patient.clinic_id, req.user!.clinicId)) {
        return res.status(404).json({ error: "Patient not found" });
      }
      // Defense-in-depth: filter by clinic_id too (not just patient_id).
      const filtered = mockConsultations.filter(
        (c) => c.patient_id === req.params.id && c.clinic_id === req.user!.clinicId,
      );
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

      // SECURITY: verify the doctorId refers to a real DOCTOR user in the
      // caller's clinic. If the caller is a DOCTOR, force doctorId to their
      // own ID — prevents clinical identity fraud (attributing a consultation
      // to a colleague).
      let effectiveDoctorId = doctorId;
      let effectiveDoctorName = doctorName;
      if (req.user!.role === "DOCTOR") {
        effectiveDoctorId = req.user!.id;
        effectiveDoctorName = req.user!.name;
      } else {
        // ADMIN can attribute to any doctor in the clinic, but verify the doctor exists.
        const doctor = mockUsers.find(
          (u) => u.id === doctorId && u.clinic_id === clinicId && u.role === "DOCTOR" && u.is_active,
        );
        if (!doctor) {
          return res.status(400).json({ error: "Specified doctorId does not exist in your clinic" });
        }
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
        doctor_id: effectiveDoctorId,
        doctor_name: effectiveDoctorName,
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
        details: { patientId: req.params.id, diagnosis: diagnosis_cie10, doctorId: effectiveDoctorId },
      });
      res.json(newCons);
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  },
);
