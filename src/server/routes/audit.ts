/**
 * Audit log routes (admin-only read; clients cannot write audit logs).
 *
 * POST /api/audit_logs was intentionally removed. Audit entries are created
 * server-side by appendAuditLog() from inside privileged handlers. Allowing
 * clients to write their own audit entries destroyed the integrity of the
 * audit trail (HIPAA violation).
 */
import { Router } from "express";
import { AuthenticatedRequest, authenticateToken, requireRole } from "../middleware/auth.js";
import { mockAuditLogs } from "../config.js";

export const auditRouter = Router();

auditRouter.get("/api/audit_logs", authenticateToken, requireRole("ADMIN"), async (req: AuthenticatedRequest, res) => {
  const clinicId = req.user!.clinicId; // IDOR fix
  try {
    const filtered = mockAuditLogs.filter((l) => l.clinic_id === clinicId).slice(-50).reverse();
    res.json(filtered);
  } catch (err: any) {
    res.status(500).json({ error: "Internal server error" });
  }
});
