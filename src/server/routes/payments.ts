/**
 * Payment routes: /api/payments/create-order
 *
 * Webhook handler lives in webhooks.ts. This file only handles the
 * "create order" flow that calls the external payment gateway.
 */
import { Router } from "express";
import { AuthenticatedRequest, authenticateToken } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { schemas } from "../schemas/index.js";
import { env, mockAuditLogs, mockInvoices } from "../config.js";
import { generateRandomId } from "../utils/crypto.js";
import { appendAuditLog } from "../utils/audit.js";

export const paymentsRouter = Router();

const PAYMENT_GATEWAY_TOKEN = env.PAYMENT_GATEWAY_TOKEN;
const PAYMENT_GATEWAY_URL = env.PAYMENT_GATEWAY_URL;

paymentsRouter.post("/api/payments/create-order", authenticateToken, validateBody(schemas.createOrder), async (req: AuthenticatedRequest, res: any) => {
  const { invoiceId, amount, patientName } = req.body;
  const clinicId = req.user!.clinicId;

  // TEST MODE if no token configured
  if (!PAYMENT_GATEWAY_TOKEN) {
    console.warn("[payment] PAYMENT_GATEWAY_TOKEN not configured. Using test URL.");
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
    const amountInCents = Math.round(amount * 100);
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
    console.error("[payment] Gateway error:", err.message);
    res.status(500).json({ error: "Payment gateway error" });
  }
});
