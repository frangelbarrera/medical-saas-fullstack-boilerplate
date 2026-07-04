/**
 * Audit log routes (admin-only read; clients cannot write audit logs).
 *
 * POST /api/audit_logs was intentionally removed. Audit entries are created
 * server-side by appendAuditLog() from inside privileged handlers. Allowing
 * clients to write their own audit entries destroyed the integrity of the
 * audit trail (HIPAA violation).
 *
 * GET supports pagination via ?page=N&limit=M (default limit=100, max=500).
 * The previous .slice(-50) allowed attackers to push malicious entries out
 * of the visible window by flooding benign entries.
 */
import { Router } from "express";
import { AuthenticatedRequest, authenticateToken, requireRole } from "../middleware/auth.js";
import { mockAuditLogs } from "../config.js";

export const auditRouter = Router();

auditRouter.get("/api/audit_logs", authenticateToken, requireRole("ADMIN"), async (req: AuthenticatedRequest, res) => {
  const clinicId = req.user!.clinicId; // IDOR fix
  try {
    const page = Math.max(1, parseInt((req.query.page as string) || "1", 10) || 1);
    const limit = Math.min(500, Math.max(1, parseInt((req.query.limit as string) || "100", 10) || 100));

    const clinicLogs = mockAuditLogs.filter((l) => l.clinic_id === clinicId);
    // Most recent first
    const sorted = clinicLogs.slice().reverse();
    const start = (page - 1) * limit;
    const paginated = sorted.slice(start, start + limit);

    res.json({
      logs: paginated,
      pagination: {
        page,
        limit,
        total: clinicLogs.length,
        totalPages: Math.ceil(clinicLogs.length / limit),
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/audit_logs/verify — verify the SHA-256 hash chain integrity.
 * Walks the chain and reports the first broken link (if any).
 * Returns { valid: true } if the chain is intact.
 */
auditRouter.get(
  "/api/audit_logs/verify",
  authenticateToken,
  requireRole("ADMIN"),
  async (req: AuthenticatedRequest, res) => {
    const clinicId = req.user!.clinicId;
    try {
      const clinicLogs = mockAuditLogs.filter((l) => l.clinic_id === clinicId);
      let prevHash = "";
      let brokenAt: string | null = null;

      for (const log of clinicLogs) {
        if (log.prevHash !== prevHash) {
          brokenAt = log.id;
          break;
        }
        prevHash = log.hash;
      }

      res.json({
        valid: brokenAt === null,
        brokenAt,
        totalEntries: clinicLogs.length,
      });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  },
);
