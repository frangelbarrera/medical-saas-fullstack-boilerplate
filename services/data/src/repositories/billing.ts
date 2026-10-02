/**
 * Billing repository: neutral invoices with line items, payments, expenses
 * and a provider-neutral idempotent webhook inbox.
 */
import crypto from "crypto";
import { DomainError } from "@medical/domain";
import type { Tx } from "../client.js";
import type {
  BillingSummary,
  Expense,
  ExpenseCreate,
  Invoice,
  InvoiceCreate,
  Payment,
  PaymentCreate,
} from "@medical/contracts";

export class BillingRepository {
  constructor(private tx: Tx) {}

  private invoiceDto(i: {
    id: string;
    number: string;
    patientId: string;
    status: string;
    currency: string;
    subtotal: { toNumber(): number };
    taxTotal: { toNumber(): number };
    total: { toNumber(): number };
    notes: string | null;
    issuedAt: Date | null;
    dueAt: Date | null;
    patient: { fullName: string };
    items: { id: string; description: string; quantity: { toNumber(): number }; unitPrice: { toNumber(): number }; total: { toNumber(): number } }[];
    payments: { amount: { toNumber(): number } }[];
  }): Invoice {
    return {
      id: i.id,
      number: i.number,
      patientId: i.patientId,
      patientName: i.patient.fullName,
      status: i.status as Invoice["status"],
      currency: i.currency,
      subtotal: i.subtotal.toNumber(),
      taxTotal: i.taxTotal.toNumber(),
      total: i.total.toNumber(),
      paidTotal: i.payments.reduce((sum, p) => sum + p.amount.toNumber(), 0),
      notes: i.notes,
      issuedAt: i.issuedAt?.toISOString() ?? null,
      dueAt: i.dueAt?.toISOString() ?? null,
      items: i.items.map((it) => ({
        id: it.id,
        description: it.description,
        quantity: it.quantity.toNumber(),
        unitPrice: it.unitPrice.toNumber(),
        total: it.total.toNumber(),
      })),
    };
  }

  private invoiceInclude() {
    return {
      patient: { select: { fullName: true } },
      items: true,
      payments: { select: { amount: true } },
    };
  }

  async listInvoices(clinicId: string, patientId?: string, limit = 100): Promise<Invoice[]> {
    const rows = await this.tx.invoice.findMany({
      where: { clinicId, ...(patientId ? { patientId } : {}) },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: this.invoiceInclude(),
    });
    return rows.map((r) => this.invoiceDto(r));
  }

  async findInvoice(clinicId: string, id: string): Promise<Invoice | null> {
    const i = await this.tx.invoice.findFirst({
      where: { clinicId, id },
      include: this.invoiceInclude(),
    });
    return i ? this.invoiceDto(i) : null;
  }

  private async nextInvoiceNumber(clinicId: string): Promise<string> {
    // BIL-002: the per-clinic counter row is bumped atomically. The ON
    // CONFLICT UPDATE takes a row lock through the end of the transaction,
    // so two concurrent invoices can never compute the same number; the
    // (clinic_id, number) unique index on invoices is the backstop.
    const result = await this.tx.$queryRaw<{ last_number: number }[]>`
      INSERT INTO invoice_counters (clinic_id, last_number)
      VALUES (${clinicId}, 0)
      ON CONFLICT (clinic_id) DO UPDATE SET last_number = invoice_counters.last_number + 1
      RETURNING last_number`;
    const next = Number(result[0]?.last_number ?? 0) + 1;
    return `INV-${String(next).padStart(5, "0")}`;
  }

  async createInvoice(
    ctx: { tenantId: string },
    input: InvoiceCreate,
  ): Promise<Invoice> {
    const id = crypto.randomUUID();
    const number = await this.nextInvoiceNumber(ctx.tenantId);
    const subtotal = input.items.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0);
    const total = Math.round(subtotal * 100) / 100;
    await this.tx.invoice.create({
      data: {
        id,
        clinicId: ctx.tenantId,
        patientId: input.patientId,
        payerId: input.payerId,
        number,
        status: "ISSUED",
        currency: "CHF",
        subtotal,
        taxTotal: 0,
        total,
        notes: input.notes,
        issuedAt: new Date(),
        dueAt: new Date(Date.now() + input.dueInDays * 24 * 3600 * 1000),
      },
    });
    for (const item of input.items) {
      await this.tx.invoiceItem.create({
        data: {
          clinicId: ctx.tenantId,
          invoiceId: id,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: Math.round(item.quantity * item.unitPrice * 100) / 100,
        },
      });
    }
    const created = await this.findInvoice(ctx.tenantId, id);
    if (!created) throw new Error("Invoice creation failed");
    return created;
  }

  async setInvoiceStatus(clinicId: string, id: string, status: string): Promise<Invoice | null> {
    const existing = await this.tx.invoice.findFirst({ where: { clinicId, id } });
    if (!existing) return null;
    await this.tx.invoice.update({ where: { id }, data: { status: status as never } });
    return this.findInvoice(clinicId, id);
  }

  async addPayment(
    ctx: { tenantId: string; actorId: string },
    invoiceId: string,
    input: PaymentCreate,
  ): Promise<Payment | null> {
    // Serialize concurrent payments on the same invoice so the balance check
    // below cannot race (two partial payments both passing the guard).
    const locked = await this.tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM invoices WHERE id = ${invoiceId} AND clinic_id = ${ctx.tenantId} FOR UPDATE`;
    if (locked.length === 0) return null;

    const invoice = await this.findInvoice(ctx.tenantId, invoiceId);
    if (!invoice) return null;
    if (invoice.status === "CANCELLED") {
      throw new DomainError("CONFLICT", "Cannot record a payment on a cancelled invoice");
    }
    const outstanding = Number(invoice.total) - Number(invoice.paidTotal);
    if (input.amount > outstanding) {
      throw new DomainError(
        "UNPROCESSABLE",
        `Payment exceeds the outstanding balance (${outstanding.toFixed(2)} ${invoice.currency} remaining on ${invoice.number})`,
      );
    }

    const p = await this.tx.payment.create({
      data: {
        clinicId: ctx.tenantId,
        invoiceId,
        amount: input.amount,
        currency: invoice.currency,
        method: input.method as never,
        reference: input.reference,
        recordedById: ctx.actorId,
      },
      include: {
        invoice: { select: { number: true } },
        recordedBy: { select: { fullName: true } },
      },
    });

    // Idempotent status reconciliation from payments.
    const paid = invoice.paidTotal + input.amount;
    let status = invoice.status;
    if (paid >= invoice.total) status = "PAID";
    else if (paid > 0) status = "PARTIALLY_PAID";
    await this.tx.invoice.update({ where: { id: invoiceId }, data: { status: status as never } });

    return {
      id: p.id,
      invoiceId: p.invoiceId,
      invoiceNumber: p.invoice.number,
      amount: p.amount.toNumber(),
      currency: p.currency,
      method: p.method as Payment["method"],
      reference: p.reference,
      receivedAt: p.receivedAt.toISOString(),
      recordedById: p.recordedById,
      recordedByName: p.recordedBy?.fullName ?? null,
    };
  }

  async listPayments(clinicId: string, limit = 100): Promise<Payment[]> {
    const rows = await this.tx.payment.findMany({
      where: { clinicId },
      orderBy: { receivedAt: "desc" },
      take: limit,
      include: {
        invoice: { select: { number: true } },
        recordedBy: { select: { fullName: true } },
      },
    });
    return rows.map((p) => ({
      id: p.id,
      invoiceId: p.invoiceId,
      invoiceNumber: p.invoice.number,
      amount: p.amount.toNumber(),
      currency: p.currency,
      method: p.method as Payment["method"],
      reference: p.reference,
      receivedAt: p.receivedAt.toISOString(),
      recordedById: p.recordedById,
      recordedByName: p.recordedBy?.fullName ?? null,
    }));
  }

  async addExpense(
    ctx: { tenantId: string; actorId: string },
    input: ExpenseCreate,
  ): Promise<Expense> {
    const e = await this.tx.expense.create({
      data: {
        clinicId: ctx.tenantId,
        category: input.category,
        description: input.description,
        amount: input.amount,
        incurredAt: input.incurredAt ? new Date(input.incurredAt) : new Date(),
        recordedById: ctx.actorId,
      },
      include: { recordedBy: { select: { fullName: true } } },
    });
    return {
      id: e.id,
      category: e.category,
      description: e.description,
      amount: e.amount.toNumber(),
      currency: e.currency,
      incurredAt: e.incurredAt.toISOString(),
      recordedById: e.recordedById,
      recordedByName: e.recordedBy?.fullName ?? null,
    };
  }

  async listExpenses(clinicId: string, limit = 100): Promise<Expense[]> {
    const rows = await this.tx.expense.findMany({
      where: { clinicId },
      orderBy: { incurredAt: "desc" },
      take: limit,
      include: { recordedBy: { select: { fullName: true } } },
    });
    return rows.map((e) => ({
      id: e.id,
      category: e.category,
      description: e.description,
      amount: e.amount.toNumber(),
      currency: e.currency,
      incurredAt: e.incurredAt.toISOString(),
      recordedById: e.recordedById,
      recordedByName: e.recordedBy?.fullName ?? null,
    }));
  }

  async summary(clinicId: string): Promise<BillingSummary> {
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const [invoices, payments, expenses] = await Promise.all([
      this.listInvoices(clinicId, undefined, 500),
      this.listPayments(clinicId, 500),
      this.listExpenses(clinicId, 500),
    ]);

    const invoiced30d = invoices
      .filter((i) => i.issuedAt && new Date(i.issuedAt) >= since && i.status !== "CANCELLED" && i.status !== "DRAFT")
      .reduce((sum, i) => sum + i.total, 0);
    const collected30d = payments
      .filter((p) => new Date(p.receivedAt) >= since)
      .reduce((sum, p) => sum + p.amount, 0);
    const expenses30d = expenses
      .filter((e) => new Date(e.incurredAt) >= since)
      .reduce((sum, e) => sum + e.amount, 0);
    const outstanding = invoices
      .filter((i) => i.status === "ISSUED" || i.status === "PARTIALLY_PAID" || i.status === "OVERDUE")
      .reduce((sum, i) => sum + (i.total - i.paidTotal), 0);
    const overdueCount = invoices.filter(
      (i) => (i.status === "ISSUED" || i.status === "PARTIALLY_PAID") && i.dueAt && new Date(i.dueAt) < new Date(),
    ).length;

    return {
      currency: "CHF",
      invoiced30d: Math.round(invoiced30d * 100) / 100,
      collected30d: Math.round(collected30d * 100) / 100,
      outstanding: Math.round(outstanding * 100) / 100,
      overdueCount,
      expenses30d: Math.round(expenses30d * 100) / 100,
      recentInvoices: invoices.slice(0, 10),
      recentPayments: payments.slice(0, 10),
    };
  }

  // ------------------------------------------------------------------ webhook

  /**
   * Provider-neutral webhook ingestion (BIL-001): idempotent by
   * (provider, external_id). Only minimal metadata is persisted - payload
   * SHA-256 hash and byte size - never the raw payload.
   */
  async recordWebhookEvent(
    input: { provider: string; externalId: string; signatureValid: boolean; payloadHash?: string; sizeBytes?: number },
  ): Promise<{ status: "PROCESSED" | "REJECTED" | "DUPLICATE" }> {
    const existing = await this.tx.webhookEvent.findUnique({
      where: { provider_externalId: { provider: input.provider, externalId: input.externalId } },
      select: { id: true, status: true },
    });
    if (existing) return { status: "DUPLICATE" };
    if (!input.signatureValid) {
      await this.tx.webhookEvent.create({
        data: {
          provider: input.provider,
          externalId: input.externalId,
          signatureValid: false,
          payloadHash: input.payloadHash,
          sizeBytes: input.sizeBytes,
          status: "REJECTED",
        },
      });
      return { status: "REJECTED" };
    }
    await this.tx.webhookEvent.create({
      data: {
        provider: input.provider,
        externalId: input.externalId,
        signatureValid: true,
        payloadHash: input.payloadHash,
        sizeBytes: input.sizeBytes,
        status: "PROCESSED",
      },
    });
    return { status: "PROCESSED" };
  }
}
