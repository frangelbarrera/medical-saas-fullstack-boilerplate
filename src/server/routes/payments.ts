/**
 * Payment routes: /api/payments/create-order
 *
 * Webhook handler lives in webhooks.ts. This file only handles the
 * "create order" flow that calls the external payment gateway.
 *
 * Security: the order amount is taken from the invoice record (looked up by
 * invoiceId + clinicId from JWT), NEVER from the request body. This prevents
 * underpayment attacks (paying $0.01 for a $10,000 invoice) and cross-clinic
 * invoice fraud.
 */
import { Router } from "express";
import { AuthenticatedRequest, authenticateToken } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { schemas } from "../schemas/index.js";
import { env, mockInvoices } from "../config.js";
import { generateRandomId } from "../utils/crypto.js";
import { appendAuditLog } from "../utils/audit.js";
import { logger } from "../utils/logger.js";

export const paymentsRouter = Router();

const PAYMENT_GATEWAY_TOKEN = env.PAYMENT_GATEWAY_TOKEN;
const PAYMENT_GATEWAY_URL = env.PAYMENT_GATEWAY_URL;

paymentsRouter.post(
  "/api/payments/create-order",
  authenticateToken,
  validateBody(schemas.createOrder),
  async (req: AuthenticatedRequest, res: any) => {
    const { invoiceId, patientName } = req.body;
    const clinicId = req.user!.clinicId;

    // SECURITY: look up the invoice and verify ownership + status.
    // The amount is taken from the invoice record, NEVER from the request body.
    const invoice = mockInvoices.find((i) => i.id === invoiceId && i.clinic_id === clinicId);
    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }
    if (invoice.status === "Paid") {
      return res.status(409).json({ error: "Invoice is already paid" });
    }
    if (invoice.status === "Cancelled") {
      return res.status(409).json({ error: "Invoice is cancelled" });
    }

    // Use the invoice amount (server-side source of truth), ignore body amount.
    const amount = invoice.amount;
    const amountInCents = Math.round(amount * 100);
    if (amountInCents <= 0) {
      return res.status(400).json({ error: "Invoice amount must be greater than zero" });
    }

    // TEST MODE if no token configured
    if (!PAYMENT_GATEWAY_TOKEN) {
      logger.warn({ msg: "PAYMENT_GATEWAY_TOKEN not configured, using test URL" });
      appendAuditLog({
        id: generateRandomId("log"),
        clinic_id: clinicId,
        user_id: req.user!.id,
        user_name: req.user!.name,
        action: "Digital Payment Simulation (No Token)",
        target: invoiceId,
        type: "FINANCE",
        details: { amount, invoiceId, note: "Simulation mode activated due to missing credentials" },
      });
      return res.json({
        paymentUrl: "https://www.google.com/search?q=Digital+Payment+Simulation",
        paymentId: "mock_id_123",
      });
    }

    try {
      // Host Header Injection fix: use FRONTEND_URL env var, not req.get('host')
      const baseUrl = env.FRONTEND_URL;

      const payload = {
        amount: amountInCents,
        amountWithoutTax: amountInCents,
        currency: "USD",
        clientTransactionId: invoiceId,
        responseUrl: `${baseUrl}/finance?payment=success`,
        cancellationUrl: `${baseUrl}/finance?payment=cancelled`,
      };

      // Timeout to prevent slow-loris style abuse
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(PAYMENT_GATEWAY_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PAYMENT_GATEWAY_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      }).catch((fetchErr: any) => {
        clearTimeout(timeout);
        if (fetchErr.name === "AbortError") {
          throw new Error("Payment gateway request timed out after 10s");
        }
        throw new Error(`Payment gateway unreachable: ${fetchErr.message}`);
      });
      clearTimeout(timeout);

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Error creating payment order");
      }

      appendAuditLog({
        id: generateRandomId("log"),
        clinic_id: clinicId,
        user_id: req.user!.id,
        user_name: req.user!.name,
        action: "Digital Payment Attempt",
        target: invoiceId,
        type: "FINANCE",
        details: { amount, invoiceId, gatewayId: data.paymentId },
      });

      res.json({ paymentUrl: data.paymentUrl, paymentId: data.paymentId });
    } catch (err: any) {
      logger.error({ msg: "Payment gateway error", error: err.message });
      res.status(500).json({ error: "Payment gateway error" });
    }
  },
);
