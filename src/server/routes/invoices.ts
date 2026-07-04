/**
 * Invoice routes.
 *
 * SECURITY:
 *  - patientId and doctorId from the body are verified to belong to the caller's clinic.
 *  - status is forced to "Pending" on creation (prevents creating already-Paid invoices).
 */
import { Router } from "express";
import { AuthenticatedRequest, authenticateToken, assertClinicOwnership } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { schemas } from "../schemas/index.js";
import { mockInvoices, mockPatients, mockUsers } from "../config.js";
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
      // SECURITY: verify patientId belongs to the caller's clinic.
      const patient = mockPatients.find((p) => p.id === patientId);
      if (!patient || !assertClinicOwnership(patient.clinic_id, clinicId)) {
        return res.status(400).json({ error: "patientId does not belong to your clinic" });
      }

      // SECURITY: verify doctorId if provided.
      if (doctorId) {
        const doctor = mockUsers.find((u) => u.id === doctorId && u.clinic_id === clinicId);
        if (!doctor) {
          return res.status(400).json({ error: "doctorId does not refer to a user in your clinic" });
        }
      }

      // SECURITY: force status to "Pending" on creation. The client cannot
      // create an already-Paid invoice (which would be financial fraud).
      // Only the payment webhook can mark an invoice as Paid.
      const newInv = {
        id,
        patient_id: patientId,
        patient_name: patientName,
        doctor_id: doctorId,
        doctor_name: doctorName,
        concept,
        amount,
        payment_method: paymentMethod,
        status: "Pending",
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
        details: { patientId, amount, paymentMethod, requestedStatus: status, forcedStatus: "Pending" },
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
