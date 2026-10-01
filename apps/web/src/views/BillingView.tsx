/**
 * Billing: editorial numbers strip + tabbed tables (invoices / payments /
 * expenses) with invoice creation and payment recording.
 */
import { useCallback, useEffect, useState } from "react";
import type { BillingSummary, Expense, Invoice, Payment } from "@medical/contracts";
import { api, ApiProblem } from "../lib/api.js";
import { useSession } from "../auth/index.js";
import { useI18n } from "../i18n/index.js";
import { formatDate, formatMoney } from "../lib/format.js";
import {
  Banner,
  Button,
  DataTable,
  EmptyState,
  Input,
  Kicker,
  Modal,
  Select,
  StateLabel,
  Tabs,
  Textarea,
  useToast,
} from "@medical/ui";

type BillingTab = "invoices" | "payments" | "expenses";
const METHODS = ["CASH", "CARD", "BANK_TRANSFER", "INSURANCE", "OTHER"] as const;

export const BillingView = () => {
  const { t, locale } = useI18n();
  const { can, profile } = useSession();
  const { toast: _toast } = useToast();
  const [tab, setTab] = useState<BillingTab>("invoices");
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [payOpen, setPayOpen] = useState<Invoice | null>(null);
  const [expenseOpen, setExpenseOpen] = useState(false);

  const currency = profile?.clinic.currency ?? "CHF";

  const load = useCallback(async () => {
    const [s, inv, pays, exps] = await Promise.all([
      api.billingSummary(),
      api.invoices(),
      api.payments().catch(() => ({ items: [] as Payment[] })),
      api.expenses().catch(() => ({ items: [] as Expense[] })),
    ]);
    setSummary(s);
    setInvoices(inv.items);
    setPayments(pays.items);
    setExpenses(exps.items);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const invoiceStatusLabel = (s: string) => t(`billing.status.${s}` as "billing.status.PAID");

  return (
    <section aria-label={t("billing.title")}>
      <div className="flex items-end justify-between mb-8 max-md:flex-col max-md:items-start max-md:gap-5">
        <div>
          <Kicker>BILLING / {currency}</Kicker>
          <h1 className="font-serif text-3xl m-0 text-ink mt-2">
            {t("billing.title")}<span className="text-moss">.</span>
          </h1>
          <p className="text-sm text-ink-soft mt-3 mb-0">{t("billing.lede")}</p>
        </div>
        {can("billing:write") ? (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setExpenseOpen(true)}>{t("billing.recordExpense")}</Button>
            <Button variant="action" arrow onClick={() => setInvoiceOpen(true)}>{t("billing.newInvoice")}</Button>
          </div>
        ) : null}
      </div>

      {summary ? (
        <div className="border-y-2 border-ink border-b-rule flex flex-wrap gap-10 py-3.5 mb-8 font-mono text-2xs text-ink-soft [&>span]:flex [&>span]:flex-col [&>span]:gap-1">
          <span>
            <b className="text-ink font-medium text-sm">{formatMoney(summary.invoiced30d, currency, locale)}</b>
            {t("billing.invoiced30")}
          </span>
          <span>
            <b className="text-moss font-medium text-sm">{formatMoney(summary.collected30d, currency, locale)}</b>
            {t("billing.collected30")}
          </span>
          <span>
            <b className="text-ink font-medium text-sm">{formatMoney(summary.outstanding, currency, locale)}</b>
            {t("billing.outstanding")}
          </span>
          <span>
            <b className={summary.overdueCount > 0 ? "text-signal font-medium text-sm" : "text-ink font-medium text-sm"}>{summary.overdueCount}</b>
            {t("billing.overdue")}
          </span>
          <span>
            <b className="text-ink font-medium text-sm">{formatMoney(summary.expenses30d, currency, locale)}</b>
            {t("billing.expenses30")}
          </span>
        </div>
      ) : null}

      <Tabs<BillingTab>
        label={t("billing.title")}
        tabs={[
          { id: "invoices", label: t("billing.invoices") },
          { id: "payments", label: t("billing.payments") },
          { id: "expenses", label: t("billing.expenses") },
        ]}
        active={tab}
        onChange={setTab}
      />

      <div className="mt-8">
        {tab === "invoices" ? (
          invoices.length === 0 ? (
            <EmptyState title={t("billing.invoices")} body={t("billing.lede")} />
          ) : (
            <DataTable<Invoice>
              caption={t("billing.invoices")}
              rows={invoices}
              columns={[
                { key: "number", header: t("billing.number"), render: (i) => <span className="font-mono text-2xs text-ink">{i.number}</span> },
                { key: "patient", header: t("billing.patient"), render: (i) => <strong className="text-ink">{i.patientName}</strong> },
                { key: "issued", header: t("billing.issued"), render: (i) => formatDate(i.issuedAt, locale) },
                { key: "due", header: t("billing.due"), render: (i) => formatDate(i.dueAt, locale) },
                { key: "total", header: t("billing.amount"), align: "right", render: (i) => <strong className="text-ink">{formatMoney(i.total, i.currency, locale)}</strong> },
                { key: "paid", header: t("billing.paid"), align: "right", render: (i) => formatMoney(i.paidTotal, i.currency, locale) },
                { key: "status", header: t("common.status"), render: (i) => <StateLabel tone={i.status === "PAID" ? "good" : i.status === "OVERDUE" || i.status === "CANCELLED" ? "alert" : "neutral"}>{invoiceStatusLabel(i.status)}</StateLabel> },
                {
                  key: "actions",
                  header: "",
                  width: "120px",
                  render: (i) =>
                    can("billing:write") && i.status !== "PAID" && i.status !== "CANCELLED" ? (
                      <button type="button" className="font-mono text-2xs text-moss hover:underline" onClick={() => setPayOpen(i)}>
                        {t("billing.recordPayment")}
                      </button>
                    ) : null,
                },
              ]}
            />
          )
        ) : tab === "payments" ? (
          <DataTable<Payment>
            caption={t("billing.payments")}
            rows={payments}
            empty={<EmptyState title={t("billing.payments")} body={t("billing.lede")} />}
            columns={[
              { key: "date", header: t("common.date"), render: (p) => <span className="font-mono text-2xs">{formatDate(p.receivedAt, locale)}</span> },
              { key: "number", header: t("billing.number"), render: (p) => <span className="font-mono text-2xs text-ink">{p.invoiceNumber}</span> },
              { key: "method", header: t("billing.method"), render: (p) => p.method.toLowerCase().replace(/_/g, " ") },
              { key: "amount", header: t("billing.amount"), align: "right", render: (p) => <strong className="text-ink">{formatMoney(p.amount, p.currency, locale)}</strong> },
              { key: "by", header: t("audit.actor"), render: (p) => p.recordedByName ?? "—" },
            ]}
          />
        ) : (
          <DataTable<Expense>
            caption={t("billing.expenses")}
            rows={expenses}
            empty={<EmptyState title={t("billing.expenses")} body={t("billing.lede")} />}
            columns={[
              { key: "date", header: t("common.date"), render: (e) => <span className="font-mono text-2xs">{formatDate(e.incurredAt, locale)}</span> },
              { key: "cat", header: t("billing.category"), render: (e) => e.category },
              { key: "desc", header: t("billing.description"), render: (e) => <strong className="text-ink">{e.description}</strong> },
              { key: "amount", header: t("billing.amount"), align: "right", render: (e) => formatMoney(e.amount, e.currency, locale) },
            ]}
          />
        )}
      </div>

      <InvoiceModal open={invoiceOpen} onClose={() => setInvoiceOpen(false)} onSaved={async () => { setInvoiceOpen(false); await load(); }} />
      <PaymentModal invoice={payOpen} onClose={() => setPayOpen(null)} onSaved={async () => { setPayOpen(null); await load(); }} />
      <ExpenseModal open={expenseOpen} onClose={() => setExpenseOpen(false)} onSaved={async () => { setExpenseOpen(false); await load(); }} />
    </section>
  );
};

const InvoiceModal = ({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => Promise<void> }) => {
  const { t } = useI18n();
  const { toast } = useToast();
  const [patientQuery, setPatientQuery] = useState("");
  const [patientId, setPatientId] = useState("");
  const [patientName, setPatientName] = useState("");
  const [results, setResults] = useState<{ id: string; fullName: string; internalRef: string }[]>([]);
  const [items, setItems] = useState([{ description: "", quantity: 1, unitPrice: 0 }]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || patientId) return;
    const q = patientQuery.trim();
    if (q.length < 2) return setResults([]);
    const timer = setTimeout(() => {
      api.patients({ q, limit: 5 }).then((r) => setResults(r.items)).catch(() => setResults([]));
    }, 220);
    return () => clearTimeout(timer);
  }, [patientQuery, open, patientId]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.createInvoice({
        patientId,
        notes: notes || undefined,
        items: items.filter((i) => i.description.trim() && i.unitPrice > 0),
      });
      toast(t("common.saved"), "success");
      setPatientId(""); setPatientQuery(""); setItems([{ description: "", quantity: 1, unitPrice: 0 }]); setNotes("");
      await onSaved();
    } catch (err) {
      setError(err instanceof ApiProblem ? err.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  };

  const total = items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);

  return (
    <Modal open={open} onClose={onClose} kicker={t("billing.newInvoice").toUpperCase()} title={t("billing.newInvoice")} wide
      footer={<><Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
        <Button variant="action" disabled={busy || !patientId || total <= 0} onClick={() => void submit()}>{t("common.create")}</Button></>}>
      {error ? <div className="mb-4"><Banner tone="warning">{error}</Banner></div> : null}
      {patientId ? (
        <p className="border-b border-ink py-1.5 text-sm flex justify-between">
          <span>{patientName}</span>
          <button type="button" className="font-mono text-2xs text-ink-faint hover:text-signal" onClick={() => { setPatientId(""); setPatientQuery(""); }}>change</button>
        </p>
      ) : (
        <Input label={t("billing.patient")} value={patientQuery} onChange={(e) => setPatientQuery(e.target.value)} placeholder={t("patients.searchPlaceholder")} />
      )}
      {results.length > 0 && !patientId ? (
        <ul className="list-none m-0 p-0 mb-4 border border-rule">
          {results.map((p) => (
            <li key={p.id}>
              <button type="button" className="w-full text-left px-3 py-2 hover:bg-paper-deep text-sm" onClick={() => { setPatientId(p.id); setPatientName(p.fullName); setResults([]); }}>
                {p.fullName} <span className="font-mono text-2xs text-ink-faint ml-2">{p.internalRef}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="border-t-2 border-ink pt-3">
        <Kicker>{t("billing.items").toUpperCase()}</Kicker>
        <div className="mt-3 space-y-3">
          {items.map((item, idx) => (
            <div key={idx} className="grid grid-cols-[1fr_80px_120px_32px] gap-3 items-end">
              <Input label={idx === 0 ? t("billing.description") : ""} value={item.description}
                onChange={(e) => setItems(items.map((it, i) => (i === idx ? { ...it, description: e.target.value } : it)))} />
              <Input label={idx === 0 ? t("billing.quantity") : ""} type="number" min={1} value={item.quantity}
                onChange={(e) => setItems(items.map((it, i) => (i === idx ? { ...it, quantity: Number(e.target.value) } : it)))} />
              <Input label={idx === 0 ? t("billing.unitPrice") : ""} type="number" min={0} step="0.05" value={item.unitPrice}
                onChange={(e) => setItems(items.map((it, i) => (i === idx ? { ...it, unitPrice: Number(e.target.value) } : it)))} />
              <button type="button" aria-label={t("common.delete")} className="pb-2.5 text-ink-faint hover:text-signal"
                onClick={() => setItems(items.filter((_, i) => i !== idx))}>✕</button>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between mt-4">
          <Button variant="ghost" size="sm" onClick={() => setItems([...items, { description: "", quantity: 1, unitPrice: 0 }])}>
            + {t("billing.addItem")}
          </Button>
          <strong className="font-mono text-sm">Total: {total.toFixed(2)}</strong>
        </div>
      </div>
      <Textarea label={`${t("common.notes")} (${t("common.optional")})`} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
    </Modal>
  );
};

const PaymentModal = ({ invoice, onClose, onSaved }: { invoice: Invoice | null; onClose: () => void; onSaved: () => Promise<void> }) => {
  const { t, locale } = useI18n();
  const { toast } = useToast();
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState<string>("CARD");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (invoice) setAmount(Math.max(0, invoice.total - invoice.paidTotal));
  }, [invoice]);

  if (!invoice) return null;
  const submit = async () => {
    setBusy(true);
    try {
      await api.payInvoice(invoice.id, { amount, method });
      toast(t("common.saved"), "success");
      await onSaved();
    } catch (err) {
      toast(err instanceof ApiProblem ? err.message : t("common.error"), "danger");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} kicker={`${invoice.number} · ${formatMoney(invoice.total, invoice.currency, locale)}`}
      title={t("billing.recordPayment")}
      footer={<><Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
        <Button variant="action" disabled={busy || amount <= 0} onClick={() => void submit()}>{t("common.save")}</Button></>}>
      <Input label={t("billing.amount")} type="number" min={0.01} step="0.05" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
      <Select label={t("billing.method")} value={method} onChange={(e) => setMethod(e.target.value)}>
        {METHODS.map((m) => <option key={m} value={m}>{m.toLowerCase().replace(/_/g, " ")}</option>)}
      </Select>
      <p className="font-mono text-2xs text-ink-faint m-0">
        {t("billing.outstanding")}: {formatMoney(invoice.total - invoice.paidTotal, invoice.currency, locale)}
      </p>
    </Modal>
  );
};

const ExpenseModal = ({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => Promise<void> }) => {
  const { t } = useI18n();
  const { toast } = useToast();
  const [category, setCategory] = useState("Supplies");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState(0);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await api.createExpense({ category, description, amount });
      toast(t("common.saved"), "success");
      setDescription(""); setAmount(0);
      await onSaved();
    } catch (err) {
      toast(err instanceof ApiProblem ? err.message : t("common.error"), "danger");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} kicker={t("billing.recordExpense").toUpperCase()} title={t("billing.recordExpense")}
      footer={<><Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
        <Button variant="action" disabled={busy || !description || amount <= 0} onClick={() => void submit()}>{t("common.create")}</Button></>}>
      <Input label={t("billing.category")} value={category} onChange={(e) => setCategory(e.target.value)} />
      <Input label={t("billing.description")} value={description} onChange={(e) => setDescription(e.target.value)} />
      <Input label={t("billing.amount")} type="number" min={0.01} step="0.05" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
    </Modal>
  );
};
