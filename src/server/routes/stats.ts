/**
 * Stats routes (clinic dashboard KPIs).
 */
import { Router } from "express";
import { AuthenticatedRequest, authenticateToken } from "../middleware/auth.js";
import { mockPatients, mockConsultations } from "../config.js";

export const statsRouter = Router();

statsRouter.get("/api/stats", authenticateToken, async (req: AuthenticatedRequest, res) => {
  const clinicId = req.user!.clinicId;
  try {
    const pCount = mockPatients.filter((p) => p.clinic_id === clinicId).length;
    const cCount = mockConsultations.filter((c) => c.clinic_id === clinicId).length;
    res.json({
      patients: pCount,
      consultations: cCount,
      appointments: 0,
      alerts: 0,
    });
  } catch (err: any) {
    res.status(500).json({ error: "Internal server error" });
  }
});
