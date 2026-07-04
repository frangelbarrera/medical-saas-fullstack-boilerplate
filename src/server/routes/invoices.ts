/**
 * Invoice routes.
 */
import { Router } from "express";
import { AuthenticatedRequest, authenticateToken } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { schemas } from "../schemas/index.js";
import { mockInvoices } from "../config.js";
import { generateRandomId } from "../utils/crypto.js";
import { appendAuditLog } from "../utils/audit.js";

export const invoicesRouter = Router();

invoicesRouter.get("/api/invoices", authenticateToken, async (req: AuthenticatedRequest, res) => {
  const clinicId = req.user!.clinicId;
  try {
    const filtered = mockInvoices.filter((i) => i.clinic_id === clinicId);
    res.json(
      filtered.map((i) => ({
        ...i,
        clinicId: i.clinic_id,
        patientId: i.patient_id,
        patientName: i.patient_name,
        doctorId: i.doctor_id,
        doctorName: i.doctor_name,
        paymentMethod: i.payment_method,
        insuranceCompany: i.insurance_company,
        createdAt: i.date,
      })),
    );
  } catch (err: any) {
    res.status(500).json({ error: "Internal server error" });
  }
});

invoicesRouter.post(
  "/api/invoices",
  authenticateToken,
  validateBody(schemas.invoiceCreate),
  async (req: AuthenticatedRequest, res) => {
    const {
      patientId,
      patientName,
      doctorId,
      doctorName,
      concept,
      amount,
      paymentMethod,
      status,
      insuranceCompany,
      date,
    } = req.body;
    const clinicId = req.user!.clinicId;
    const id = generateRandomId("inv");

    try {
      const newInv = {
        id,
        patient_id: patientId,
        patient_name: patientName,
        doctor_id: doctorId,
        doctor_name: doctorName,
        concept,
        amount,
        payment_method: paymentMethod,
        status,
        insurance_company: insuranceCompany,
        date,
        clinic_id: clinicId,
      };
      mockInvoices.push(newInv);
      appendAuditLog({
        id: generateRandomId("log"),
        clinic_id: clinicId,
        user_id: req.user!.id,
        user_name: req.user!.name,
        action: "INVOICE_CREATE",
        target: id,
        type: "FINANCE",
        details: { patientId, amount, paymentMethod },
      });
      res.json({
        ...newInv,
        clinicId: newInv.clinic_id,
        patientId: newInv.patient_id,
        patientName: newInv.patient_name,
        doctorId: newInv.doctor_id,
        doctorName: newInv.doctor_name,
        paymentMethod: newInv.payment_method,
        insuranceCompany: newInv.insurance_company,
        createdAt: newInv.date,
      });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  },
);
