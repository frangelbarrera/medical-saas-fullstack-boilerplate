/**
 * Patient routes (PHI encrypted at rest).
 */
import { Router } from "express";
import { AuthenticatedRequest, authenticateToken, requireRole, assertClinicOwnership } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { schemas } from "../schemas/index.js";
import { mockPatients } from "../config.js";
import { encryptPHI, decryptPHI, generateRandomId } from "../utils/crypto.js";
import { appendAuditLog } from "../utils/audit.js";

export const patientsRouter = Router();

patientsRouter.get("/api/patients", authenticateToken, async (req: AuthenticatedRequest, res) => {
  const clinicId = req.user!.clinicId; // IDOR fix
  const doctorId = req.query.doctorId as string | undefined;
  try {
    let filtered = mockPatients.filter((p) => p.clinic_id === clinicId);
    if (doctorId) {
      filtered = filtered.filter((p) => p.doctor_id === doctorId || p.doctorId === doctorId);
    }
    res.json(
      filtered.map((p) => ({
        ...p,
        dni: decryptPHI(p.dni),
        email: decryptPHI(p.email),
        phone: decryptPHI(p.phone),
        clinicId: p.clinic_id,
        birthDate: decryptPHI(p.birth_date),
      })),
    );
  } catch (err: any) {
    res.status(500).json({ error: "Internal server error" });
  }
});

patientsRouter.post(
  "/api/patients",
  authenticateToken,
  validateBody(schemas.patientCreate),
  async (req: AuthenticatedRequest, res) => {
    const { name, dni, email, phone, birthDate, gender, status } = req.body;
    const clinicId = req.user!.clinicId;
    const id = generateRandomId("pat");

    try {
      const newPat = {
        id,
        name,
        dni: encryptPHI(dni),
        email: encryptPHI(email),
        phone: encryptPHI(phone),
        birth_date: encryptPHI(birthDate),
        gender,
        status,
        clinic_id: clinicId,
      };
      mockPatients.push(newPat);
      appendAuditLog({
        id: generateRandomId("log"),
        clinic_id: clinicId,
        user_id: req.user!.id,
        user_name: req.user!.name,
        action: "PATIENT_CREATE",
        target: id,
        type: "PHI",
        details: { name },
      });
      res.json({ ...newPat, dni, email, phone, clinicId: newPat.clinic_id, birthDate });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

patientsRouter.put(
  "/api/patients/:id",
  authenticateToken,
  validateBody(schemas.patientUpdate),
  async (req: AuthenticatedRequest, res) => {
    const { name, dni, email, phone, birthDate, gender, status } = req.body;
    try {
      const idx = mockPatients.findIndex((p) => p.id === req.params.id);
      if (idx === -1) return res.status(404).json({ error: "Patient not found" });
      if (!assertClinicOwnership(mockPatients[idx].clinic_id, req.user!.clinicId)) {
        return res.status(404).json({ error: "Patient not found" });
      }
      mockPatients[idx] = {
        ...mockPatients[idx],
        name: name || mockPatients[idx].name,
        dni: dni ? encryptPHI(dni) : mockPatients[idx].dni,
        email: email !== undefined ? encryptPHI(email) : mockPatients[idx].email,
        phone: phone !== undefined ? encryptPHI(phone) : mockPatients[idx].phone,
        birth_date: birthDate ? encryptPHI(birthDate) : mockPatients[idx].birth_date,
        gender: gender || mockPatients[idx].gender,
        status: status || mockPatients[idx].status,
      };
      appendAuditLog({
        id: generateRandomId("log"),
        clinic_id: req.user!.clinicId,
        user_id: req.user!.id,
        user_name: req.user!.name,
        action: "PATIENT_UPDATE",
        target: req.params.id,
        type: "PHI",
        details: { name, gender, status },
      });
      res.json({
        ...mockPatients[idx],
        dni: decryptPHI(mockPatients[idx].dni),
        email: decryptPHI(mockPatients[idx].email),
        phone: decryptPHI(mockPatients[idx].phone),
        birthDate: decryptPHI(mockPatients[idx].birth_date),
      });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// DELETE patients requires ADMIN — secretary/doctor must not be able to
// permanently destroy PHI (HIPAA retention requirements).
patientsRouter.delete(
  "/api/patients/:id",
  authenticateToken,
  requireRole("ADMIN"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const idx = mockPatients.findIndex((p) => p.id === req.params.id);
      if (idx === -1) return res.status(404).json({ error: "Patient not found" });
      if (!assertClinicOwnership(mockPatients[idx].clinic_id, req.user!.clinicId)) {
        return res.status(404).json({ error: "Patient not found" });
      }
      mockPatients.splice(idx, 1);
      appendAuditLog({
        id: generateRandomId("log"),
        clinic_id: req.user!.clinicId,
        user_id: req.user!.id,
        user_name: req.user!.name,
        action: "PATIENT_DELETE",
        target: req.params.id,
        type: "PHI",
        details: {},
      });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

patientsRouter.get("/api/patients/:id", authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const p = mockPatients.find((p) => p.id === req.params.id);
    if (!p) return res.status(404).json({ error: "Patient not found" });
    if (!assertClinicOwnership(p.clinic_id, req.user!.clinicId)) {
      return res.status(404).json({ error: "Patient not found" });
    }
    res.json({
      ...p,
      dni: decryptPHI(p.dni),
      email: decryptPHI(p.email),
      phone: decryptPHI(p.phone),
      clinicId: p.clinic_id,
      birthDate: decryptPHI(p.birth_date),
    });
  } catch (err: any) {
    res.status(500).json({ error: "Internal server error" });
  }
});
