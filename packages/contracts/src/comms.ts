import { z } from "zod";

// ---------------------------------------------------------------------------
// Communications
// ---------------------------------------------------------------------------

export const THREAD_CATEGORIES = ["PATIENT", "CARE_TEAM", "INTERNAL", "SYSTEM"] as const;

export const threadCreate = z.object({
  subject: z.string().min(1).max(200),
  category: z.enum(THREAD_CATEGORIES).default("INTERNAL"),
  patientId: z.string().uuid().optional(),
  participantIds: z.array(z.string().uuid()).min(1).max(20),
  body: z.string().min(1).max(10000),
});
export type ThreadCreate = z.infer<typeof threadCreate>;

export const messageCreate = z.object({
  body: z.string().min(1).max(10000),
});
export type MessageCreate = z.infer<typeof messageCreate>;

export interface ThreadSummary {
  id: string;
  subject: string;
  category: (typeof THREAD_CATEGORIES)[number];
  patientId: string | null;
  patientName: string | null;
  createdById: string;
  createdByName: string;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  unread: boolean;
  participants: { id: string; fullName: string }[];
}

export interface Message {
  id: string;
  threadId: string;
  senderId: string;
  senderName: string;
  body: string;
  createdAt: string;
}

export interface NotificationItem {
  id: string;
  category: string;
  subject: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Billing
// ---------------------------------------------------------------------------

export const INVOICE_STATUSES = ["DRAFT", "ISSUED", "PARTIALLY_PAID", "PAID", "OVERDUE", "CANCELLED"] as const;
export const PAYMENT_METHODS = ["CASH", "CARD", "BANK_TRANSFER", "INSURANCE", "OTHER"] as const;

export const invoiceItemInput = z.object({
  description: z.string().min(1).max(300),
  quantity: z.number().int().min(1).max(1000).default(1),
  unitPrice: z.number().min(0).max(1_000_000),
});
export type InvoiceItemInput = z.infer<typeof invoiceItemInput>;

export const invoiceCreate = z.object({
  patientId: z.string().uuid(),
  payerId: z.string().uuid().optional(),
  notes: z.string().max(1000).optional(),
  dueInDays: z.number().int().min(1).max(180).default(30),
  items: z.array(invoiceItemInput).min(1).max(50),
});
export type InvoiceCreate = z.infer<typeof invoiceCreate>;

export const invoiceStatusChange = z.object({
  status: z.enum(INVOICE_STATUSES),
});
export type InvoiceStatusChange = z.infer<typeof invoiceStatusChange>;

export interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface Invoice {
  id: string;
  number: string;
  patientId: string;
  patientName: string;
  status: (typeof INVOICE_STATUSES)[number];
  currency: string;
  subtotal: number;
  taxTotal: number;
  total: number;
  paidTotal: number;
  notes: string | null;
  issuedAt: string | null;
  dueAt: string | null;
  items: InvoiceItem[];
}

export const paymentCreate = z.object({
  amount: z.number().min(0.01).max(1_000_000),
  method: z.enum(PAYMENT_METHODS),
  reference: z.string().max(120).optional(),
});
export type PaymentCreate = z.infer<typeof paymentCreate>;

export interface Payment {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
  method: (typeof PAYMENT_METHODS)[number];
  reference: string | null;
  receivedAt: string;
  recordedById: string;
  recordedByName: string | null;
}

export const expenseCreate = z.object({
  category: z.string().min(1).max(80),
  description: z.string().min(1).max(300),
  amount: z.number().min(0.01).max(1_000_000),
  incurredAt: z.string().optional(),
});
export type ExpenseCreate = z.infer<typeof expenseCreate>;

export interface Expense {
  id: string;
  category: string;
  description: string;
  amount: number;
  currency: string;
  incurredAt: string;
  recordedById: string;
  recordedByName: string | null;
}

export interface BillingSummary {
  currency: string;
  invoiced30d: number;
  collected30d: number;
  outstanding: number;
  overdueCount: number;
  expenses30d: number;
  recentInvoices: Invoice[];
  recentPayments: Payment[];
}
