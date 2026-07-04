/**
 * Expense routes.
 *
 * SECURITY: registeredBy is taken from req.user.id (JWT), NEVER from the
 * request body. This prevents accountability forgery (attributing a fraudulent
 * expense to another user). The body's registeredBy field is ignored.
 */
import { Router } from "express";
import { AuthenticatedRequest, authenticateToken } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { schemas } from "../schemas/index.js";
import { mockExpenses } from "../config.js";
import { generateRandomId } from "../utils/crypto.js";
import { appendAuditLog } from "../utils/audit.js";

export const expensesRouter = Router();

expensesRouter.get("/api/expenses", authenticateToken, async (req: AuthenticatedRequest, res) => {
  const clinicId = req.user!.clinicId;
  try {
    const filtered = mockExpenses.filter((e) => e.clinic_id === clinicId);
    res.json(filtered);
  } catch (err: any) {
    res.status(500).json({ error: "Internal server error" });
  }
});

expensesRouter.post(
  "/api/expenses",
  authenticateToken,
  validateBody(schemas.expenseCreate),
  async (req: AuthenticatedRequest, res) => {
    const { concept, category, amount, date } = req.body;
    const clinicId = req.user!.clinicId;
    const id = generateRandomId("exp");

    try {
      // SECURITY: registeredBy comes from the JWT, NOT from the request body.
      // The body's registeredBy field is ignored to prevent accountability forgery.
      const newExp = {
        id,
        concept,
        category,
        amount,
        date,
        clinic_id: clinicId,
        registered_by: req.user!.id,
        registered_name: req.user!.name,
        created_at: new Date().toISOString(),
      };
      mockExpenses.push(newExp);
      appendAuditLog({
        id: generateRandomId("log"),
        clinic_id: clinicId,
        user_id: req.user!.id,
        user_name: req.user!.name,
        action: "EXPENSE_CREATE",
        target: id,
        type: "FINANCE",
        details: { concept, category, amount },
      });
      res.json(newExp);
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  },
);
