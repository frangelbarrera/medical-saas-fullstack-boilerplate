/**
 * Messages: two-pane inbox (thread list + conversation).
 */
import { useCallback, useEffect, useState } from "react";
import type { Message, ThreadSummary } from "@medical/contracts";
import { api, ApiProblem } from "../lib/api.js";
import { useSession } from "../auth/index.js";
import { useI18n } from "../i18n/index.js";
import { formatDateTime } from "../lib/format.js";
import { Button, Kicker, Modal, Select, Input, Textarea, StateLabel, useToast } from "@medical/ui";

const CATEGORIES = ["PATIENT", "CARE_TEAM", "INTERNAL"] as const;

export const MessagesView = () => {
  const { t, locale } = useI18n();
  const { can } = useSession();
  const { toast } = useToast();
  const [threads, setThreads] = useState<ThreadSummary[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [reply, setReply] = useState("");
  const [composeOpen, setComposeOpen] = useState(false);

  const loadThreads = useCallback(async () => {
    const r = await api.threads().catch(() => ({ items: [] as ThreadSummary[] }));
    setThreads(r.items);
    return r.items;
  }, []);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    if (!activeId) return;
    setMessages(null);
    api.messages(activeId).then((r) => setMessages(r.items)).catch(() => setMessages([]));
  }, [activeId]);

  const active = threads?.find((x) => x.id === activeId) ?? null;

  const send = async () => {
    if (!activeId || !reply.trim()) return;
    try {
      await api.sendMessage(activeId, reply.trim());
      setReply("");
      const r = await api.messages(activeId);
      setMessages(r.items);
      await loadThreads();
    } catch (err) {
      toast(err instanceof ApiProblem ? err.message : t("common.error"), "danger");
    }
  };

  return (
    <section aria-label={t("messages.title")}>
      <div className="flex items-end justify-between mb-8 max-md:flex-col max-md:items-start max-md:gap-5">
        <div>
          <Kicker>SECURE COMMUNICATION</Kicker>
          <h1 className="font-serif text-3xl m-0 text-ink mt-2">
            {t("messages.title")}<span className="text-moss">.</span>
          </h1>
          <p className="text-sm text-ink-soft mt-3 mb-0">{t("messages.lede")}</p>
        </div>
        {can("messages:write") ? (
          <Button variant="action" arrow onClick={() => setComposeOpen(true)}>{t("messages.new")}</Button>
        ) : null}
      </div>

      <div className="grid grid-cols-[1.15fr_0.85fr] border-t-2 border-ink border-b border-rule max-md:grid-cols-1">
        <div aria-label={t("messages.title")} className="max-md:border-b max-md:border-rule">
          {threads === null ? (
            <p aria-busy="true" className="font-mono text-2xs text-ink-faint p-5">{t("common.loading")}…</p>
          ) : threads.length === 0 ? (
            <p className="p-5 text-sm text-ink-soft">{t("messages.emptyTitle")}</p>
          ) : (
            <ul className="list-none m-0 p-0">
              {threads.map((thread, idx) => (
                <li key={thread.id}>
                  <button
                    type="button"
                    onClick={() => setActiveId(thread.id)}
                    aria-current={thread.id === activeId ? "true" : undefined}
                    className={`w-full text-left grid grid-cols-[32px_1fr_auto] gap-2.5 px-0 py-4 border-b border-rule pr-4 hover:bg-paper-deep/40 ${
                      thread.id === activeId ? "bg-paper-deep/60" : ""
                    }`}
                  >
                    <span className="font-mono text-2xs text-ink-faint">{String(idx + 1).padStart(2, "0")}</span>
                    <span>
                      <span className="flex items-baseline gap-2">
                        <strong className="text-sm text-ink">{thread.subject}</strong>
                        {thread.category === "PATIENT" ? <StateLabel tone="neutral">{thread.patientName ?? "patient"}</StateLabel> : null}
                      </span>
                      <span className="block text-xs text-ink-soft mt-1">{thread.lastMessagePreview ?? "—"}</span>
                      <small className="block font-mono text-2xs text-ink-faint mt-1">
                        {thread.createdByName} · {formatDateTime(thread.lastMessageAt, locale)}
                      </small>
                    </span>
                    {thread.unread ? <b className="font-mono text-2xs text-signal font-normal">{t("messages.unread")}</b> : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-l border-rule max-md:border-l-0 p-10 max-md:p-5">
          {active && messages ? (
            <div>
              <h2 className="font-serif text-xl m-0 text-ink">{active.subject}</h2>
              <p className="font-mono text-2xs text-ink-faint mt-1 mb-6">
                {active.participants.map((p) => p.fullName).join(" · ")}
              </p>
              <ol className="list-none m-0 p-0 space-y-5">
                {messages.map((m) => (
                  <li key={m.id} className="border-l-2 border-rule pl-4">
                    <p className="m-0 text-xs text-ink-soft">
                      <strong className="text-ink">{m.senderName}</strong>
                      <span className="font-mono text-2xs text-ink-faint ml-2">{formatDateTime(m.createdAt, locale)}</span>
                    </p>
                    <p className="m-0 mt-1.5 text-sm text-ink whitespace-pre-wrap">{m.body}</p>
                  </li>
                ))}
              </ol>
              {can("messages:write") ? (
                <div className="mt-8">
                  <Textarea label={t("messages.write")} rows={3} value={reply} onChange={(e) => setReply(e.target.value)} />
                  <Button variant="action" disabled={!reply.trim()} onClick={() => void send()}>{t("messages.send")}</Button>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="max-w-xs">
              <Kicker>SECURE INBOX</Kicker>
              <h2 className="font-serif text-xl m-0 mt-2">{t("messages.emptyTitle")}</h2>
              <p className="text-sm text-ink-soft mt-3 mb-0 leading-relaxed">{t("messages.emptyBody")}</p>
            </div>
          )}
        </div>
      </div>

      <ComposeModal
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        onSent={async (threadId) => {
          setComposeOpen(false);
          await loadThreads();
          setActiveId(threadId);
        }}
      />
    </section>
  );
};

const ComposeModal = ({
  open,
  onClose,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  onSent: (threadId: string) => Promise<void>;
}) => {
  const { t } = useI18n();
  const { toast } = useToast();
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<string>("INTERNAL");
  const [body, setBody] = useState("");
  const [staff, setStaff] = useState<{ id: string; fullName: string }[]>([]);
  const [recipients, setRecipients] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    api.users().then((r) => setStaff(r.items.map((u) => ({ id: u.id, fullName: u.fullName })))).catch(() => setStaff([]));
  }, [open]);

  const submit = async () => {
    setBusy(true);
    try {
      const thread = await api.createThread({ subject, category, participantIds: recipients, body });
      setSubject(""); setBody(""); setRecipients([]);
      await onSent(thread.id);
    } catch (err) {
      toast(err instanceof ApiProblem ? err.message : t("common.error"), "danger");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} kicker={t("messages.new").toUpperCase()} title={t("messages.new")}
      footer={<><Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
        <Button variant="action" disabled={busy || !subject.trim() || !body.trim() || recipients.length === 0} onClick={() => void submit()}>{t("messages.send")}</Button></>}>
      <Input label={t("messages.subject")} value={subject} onChange={(e) => setSubject(e.target.value)} />
      <Select label={t("messages.category")} value={category} onChange={(e) => setCategory(e.target.value)}>
        {CATEGORIES.map((c) => <option key={c} value={c}>{c.toLowerCase()}</option>)}
      </Select>
      <div className="mb-4">
        <span className="block font-mono text-2xs uppercase tracking-[0.08em] text-ink-faint mb-1.5">{t("messages.recipients")}</span>
        <div className="flex flex-wrap gap-2">
          {staff.map((s) => (
            <button key={s.id} type="button" aria-pressed={recipients.includes(s.id)}
              onClick={() => setRecipients((r) => (r.includes(s.id) ? r.filter((x) => x !== s.id) : [...r, s.id]))}
              className={`px-2.5 py-1.5 text-xs border transition-colors ${recipients.includes(s.id) ? "border-ink text-ink bg-paper-deep" : "border-rule text-ink-soft hover:border-ink"}`}>
              {s.fullName}
            </button>
          ))}
        </div>
      </div>
      <Textarea label={t("messages.write")} rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
    </Modal>
  );
};
