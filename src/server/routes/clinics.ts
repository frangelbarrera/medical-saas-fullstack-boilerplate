/**
 * Clinic routes: /api/clinics/:id (GET, PUT)
 */
import { Router } from "express";
import { AuthenticatedRequest, authenticateToken } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { schemas } from "../schemas/index.js";
import { mockClinics } from "../config.js";

export const clinicsRouter = Router();

clinicsRouter.get("/api/clinics/:id", authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    // IDOR fix: only return the clinic if it matches the caller's clinicId
    if (req.params.id !== req.user!.clinicId) {
      return res.status(404).json({ error: "Clinic not found" });
    }
    const clinic = mockClinics.find((c) => c.id === req.params.id);
    if (!clinic) return res.status(404).json({ error: "Clinic not found" });
    res.json(clinic);
  } catch (err: any) {
    res.status(500).json({ error: "Internal server error" });
  }
});

clinicsRouter.put("/api/clinics/:id", authenticateToken, validateBody(schemas.clinicUpdate), async (req: AuthenticatedRequest, res) => {
  const { name, address, phone, email, logo } = req.body;
  try {
    if (req.params.id !== req.user!.clinicId) {
      return res.status(404).json({ error: "Clinic not found" });
    }
    const idx = mockClinics.findIndex((c) => c.id === req.params.id);
    if (idx !== -1) {
      mockClinics[idx] = { ...mockClinics[idx], name, address, phone, email, logo };
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: "Internal server error" });
  }
});
