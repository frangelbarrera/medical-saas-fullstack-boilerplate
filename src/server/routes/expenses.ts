/**
 * Expense routes.
 */
import { Router } from "express";
import { AuthenticatedRequest, authenticateToken } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { schemas } from "../schemas/index.js";
import { mockExpenses } from "../config.js";
import { generateRandomId } from "../utils/crypto.js";

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
    const { concept, category, amount, date, registeredBy } = req.body;
    const clinicId = req.user!.clinicId;
    const id = generateRandomId("exp");

    try {
      const newExp = {
        id,
        concept,
        category,
        amount,
        date,
        clinic_id: clinicId,
        registered_by: registeredBy,
        created_at: new Date().toISOString(),
      };
      mockExpenses.push(newExp);
      res.json(newExp);
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  },
);
