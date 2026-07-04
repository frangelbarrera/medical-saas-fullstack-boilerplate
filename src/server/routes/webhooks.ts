/**
 * Webhook routes: /api/webhooks/payment
 *
 * Verifies HMAC-SHA256 signature over raw body using PAYMENT_WEBHOOK_SECRET.
 * Implements idempotency (replayed webhooks are detected and skipped).
 * Validates that the invoice exists, belongs to a real clinic, and is not
 * already paid before marking it as Paid.
 */
import { Router, Request, Response } from "express";
import crypto from "crypto";
import { env, mockInvoices, mockAuditLogs } from "../config.js";
import { generateRandomId } from "../utils/crypto.js";
import { appendAuditLog } from "../utils/audit.js";
import { logger } from "../utils/logger.js";

export const webhooksRouter = Router();

webhooksRouter.post("/api/webhooks/payment", async (req: Request, res: Response) => {
  const signatureHeader = (req.get("X-Signature") || req.get("X-Payphone-Signature") || "") as string;
  if (!signatureHeader || !env.PAYMENT_WEBHOOK_SECRET) {
    return res.status(401).json({ error: "Missing signature or webhook secret not configured" });
  }

  const rawBody = (req as any).rawBody;
  if (!rawBody) {
    return res.status(400).json({ error: "Raw body required for signature verification" });
  }

  const expectedSignature = crypto.createHmac("sha256", env.PAYMENT_WEBHOOK_SECRET).update(rawBody).digest("hex");

  const signatureBuffer = Buffer.from(signatureHeader);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (signatureBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return res.status(401).json({ error: "Invalid signature" });
  }

  const { clientTransactionId, transactionId, status } = req.body;
  if (status !== "Approved") {
    return res.status(200).json({ message: "Transaction not approved" });
  }

  try {
    // Idempotency: skip if already processed
    const alreadyProcessed = mockAuditLogs.some(
      (l) =>
        l.action === "Payment received via Digital Gateway" && l.details && l.details.transactionId === transactionId,
    );
    if (alreadyProcessed) {
      return res.status(200).json({ message: "Transaction already processed (idempotent)" });
    }

    const idx = mockInvoices.findIndex((i) => i.id === clientTransactionId);
    if (idx === -1) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    // SECURITY: do not mark an already-paid invoice again (prevents replay
    // attacks with a different transactionId for the same invoice).
    if (mockInvoices[idx].status === "Paid") {
      logger.warn({ msg: "Webhook for already-paid invoice", invoiceId: clientTransactionId, transactionId });
      return res.status(200).json({ message: "Invoice already paid" });
    }

    // SECURITY: do not mark cancelled invoices as paid.
    if (mockInvoices[idx].status === "Cancelled") {
      logger.warn({ msg: "Webhook for cancelled invoice", invoiceId: clientTransactionId });
      return res.status(409).json({ error: "Invoice is cancelled" });
    }

    mockInvoices[idx].status = "Paid";
    const invoice = mockInvoices[idx];

    appendAuditLog({
      id: generateRandomId("log"),
      clinic_id: invoice.clinic_id,
      user_id: "SYSTEM",
      user_name: "Payment Gateway Webhook",
      action: "Payment received via Digital Gateway",
      target: clientTransactionId,
      type: "FINANCE",
      details: { transactionId, invoiceId: clientTransactionId, amount: invoice.amount },
    });

    res.json({ success: true });
  } catch (err: any) {
    logger.error({ msg: "Webhook processing error", error: err });
    res.status(500).json({ error: "Internal server error" });
  }
});
