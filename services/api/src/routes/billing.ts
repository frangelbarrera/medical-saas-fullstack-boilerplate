/**
 * Billing routes: invoices, payments, expenses, summary and the
 * provider-neutral payment webhook (HMAC-verified, idempotent).
 */
import { Router } from "express";
import crypto from "crypto";
import {
  invoiceCreate,
  invoiceStatusChange,
  paymentCreate,
  expenseCreate,
  payerCreate,
} from "@medical/contracts";
import { withTenantRepos, loadEnv } from "@medical/data";
import { asyncHandler, ApiError } from "../middleware/errors.js";
import { validateBody } from "../middleware/validate.js";
import { authenticate, requireCapability, type AuthedRequest } from "../middleware/auth.js";

export const billingRouter = Router();

billingRouter.get(
  "/invoices",
  authenticate,
  requireCapability("billing:read"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const patientId = typeof req.query.patientId === "string" ? req.query.patientId : undefined;
    const invoices = await withTenantRepos(ctx, (repos) =>
      repos.billing.listInvoices(ctx.tenantId, patientId),
    );
    res.json({ items: invoices });
  }),
);

billingRouter.post(
  "/invoices",
  authenticate,
  requireCapability("billing:write"),
  validateBody(invoiceCreate),
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const created = await withTenantRepos(ctx, async (repos) => {
      const invoice = await repos.billing.createInvoice(ctx, req.body);
      await repos.audit.append(ctx, {
        action: "INVOICE_CREATED",
        category: "BILLING",
        subjectPatientId: invoice.patientId,
        target: invoice.id,
        details: { number: invoice.number, total: invoice.total },
      });
      return invoice;
    });
    res.status(201).json(created);
  }),
);

billingRouter.patch(
  "/invoices/:id/status",
  authenticate,
  requireCapability("billing:write"),
  validateBody(invoiceStatusChange),
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const updated = await withTenantRepos(ctx, async (repos) => {
      const invoice = await repos.billing.setInvoiceStatus(ctx.tenantId, req.params.id, req.body.status);
      if (invoice) {
        await repos.audit.append(ctx, {
          action: "INVOICE_STATUS_CHANGED",
          category: "BILLING",
          subjectPatientId: invoice.patientId,
          target: invoice.id,
          details: { status: invoice.status },
        });
      }
      return invoice;
    });
    if (!updated) throw new ApiError(404, "NOT_FOUND", "Invoice not found");
    res.json(updated);
  }),
);

billingRouter.post(
  "/invoices/:id/payments",
  authenticate,
  requireCapability("billing:write"),
  validateBody(paymentCreate),
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const payment = await withTenantRepos(ctx, async (repos) => {
      const result = await repos.billing.addPayment(ctx, req.params.id, req.body);
      if (!result) throw new ApiError(404, "NOT_FOUND", "Invoice not found");
      await repos.audit.append(ctx, {
        action: "PAYMENT_RECORDED",
        category: "BILLING",
        subjectPatientId: result.invoiceId,
        target: result.id,
        details: { amount: result.amount, method: result.method },
      });
      return result;
    });
    res.status(201).json(payment);
  }),
);

billingRouter.get(
  "/payments",
  authenticate,
  requireCapability("billing:read"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const payments = await withTenantRepos(ctx, (repos) => repos.billing.listPayments(ctx.tenantId));
    res.json({ items: payments });
  }),
);

billingRouter.get(
  "/expenses",
  authenticate,
  requireCapability("billing:read"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const expenses = await withTenantRepos(ctx, (repos) => repos.billing.listExpenses(ctx.tenantId));
    res.json({ items: expenses });
  }),
);

billingRouter.post(
  "/expenses",
  authenticate,
  requireCapability("billing:write"),
  validateBody(expenseCreate),
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const created = await withTenantRepos(ctx, async (repos) => {
      const expense = await repos.billing.addExpense(ctx, req.body);
      await repos.audit.append(ctx, {
        action: "EXPENSE_RECORDED",
        category: "BILLING",
        target: expense.id,
        details: { amount: expense.amount, category: expense.category },
      });
      return expense;
    });
    res.status(201).json(created);
  }),
);

billingRouter.get(
  "/billing/summary",
  authenticate,
  requireCapability("billing:read"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const summary = await withTenantRepos(ctx, (repos) => repos.billing.summary(ctx.tenantId));
    res.json(summary);
  }),
);

billingRouter.get(
  "/payers",
  authenticate,
  requireCapability("billing:read"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const payers = await withTenantRepos(ctx, (repos) => repos.clinics.listPayers(ctx.tenantId));
    res.json({ items: payers });
  }),
);

billingRouter.post(
  "/payers",
  authenticate,
  requireCapability("billing:write"),
  validateBody(payerCreate),
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const created = await withTenantRepos(ctx, async (repos) => {
      const payer = await repos.clinics.createPayer(ctx.tenantId, req.body.name, req.body.type);
      await repos.audit.append(ctx, {
        action: "CLINIC_UPDATED",
        category: "BILLING",
        target: payer.id,
        details: { payer: payer.name },
      });
      return payer;
    });
    res.status(201).json(created);
  }),
);

// ---------------------------------------------------------------------------
// Payment webhook (provider-neutral, HMAC + idempotency)
// ---------------------------------------------------------------------------

export const webhooksRouter = Router();

webhooksRouter.post(
  "/webhooks/payment",
  asyncHandler(async (req, res) => {
    const env = loadEnv();
    const payload = req.body as Record<string, unknown>;
    const externalId =
      (typeof payload.id === "string" && payload.id) ||
      (typeof payload.reference === "string" && payload.reference) ||
      crypto.randomUUID();
    const signature = (req.headers["x-signature"] as string | undefined) ?? "";
    const secret = env.PAYMENT_WEBHOOK_SECRET;

    const signatureValid =
      Boolean(secret) &&
      signature.length > 0 &&
      safeHmacEqual(signature, JSON.stringify(payload), secret as string);

    const result = await withTenantRepos({ clinicId: "system", actorId: "", actorRole: "" }, (repos) =>
      repos.billing.recordWebhookEvent({
        provider: typeof payload.provider === "string" ? payload.provider : "generic",
        externalId,
        signatureValid,
        payload,
      }),
    );
    void result; // events are recorded; settlement mapping is provider-specific
    res.json({ received: true, status: result.status });
  }),
);

/** Constant-time HMAC comparison that tolerates length mismatches. */
function safeHmacEqual(provided: string, payload: string, secret: string): boolean {
  try {
    const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
