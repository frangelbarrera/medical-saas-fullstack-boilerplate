/**
 * Administration: staff, clinic settings, privacy operations (DSAR),
 * AI prompt registry and availability rules.
 */
import { useCallback, useEffect, useState } from "react";
import type { DsarRequest, PromptTemplate } from "@medical/contracts";
import { api, ApiProblem } from "../lib/api.js";
import { useSession } from "../auth/index.js";
import { useI18n } from "../i18n/index.js";
import { formatDate } from "../lib/format.js";
import {
  Banner,
  Button,
  DataTable,
  Input,
  Kicker,
  Modal,
  Select,
  StateLabel,
  Tabs,
  Textarea,
  useToast,
} from "@medical/ui";

type AdminTab = "staff" | "clinic" | "privacy" | "ai" | "availability";

export const AdminView = () => {
  const { t } = useI18n();
  const [tab, setTab] = useState<AdminTab>("staff");

  return (
    <section aria-label={t("admin.title")}>
      <div className="mb-8">
        <h1 className="font-serif text-3xl m-0 text-ink mt-2">
          {t("admin.title")}<span className="text-moss">.</span>
        </h1>
        <p className="text-sm text-ink-soft mt-3 mb-0">{t("admin.lede")}</p>
      </div>
      <Tabs<AdminTab>
        label={t("admin.title")}
        tabs={[
          { id: "staff", label: t("admin.users") },
          { id: "clinic", label: t("admin.clinic") },
          { id: "privacy", label: t("admin.privacy") },
          { id: "ai", label: t("admin.ai") },
          { id: "availability", label: t("admin.availability") },
        ]}
        active={tab}
        onChange={setTab}
      />
      <div className="mt-8">
        {tab === "staff" ? <StaffTab /> : null}
        {tab === "clinic" ? <ClinicTab /> : null}
        {tab === "privacy" ? <PrivacyTab /> : null}
        {tab === "ai" ? <AiTab /> : null}
        {tab === "availability" ? <AvailabilityTab /> : null}
      </div>
    </section>
  );
};

// ------------------------------------------------------------------- staff

const ROLES = ["ADMIN", "DOCTOR", "SECRETARY"] as const;

const StaffTab = () => {
  const { t } = useI18n();
  const { profile } = useSession();
  const { toast } = useToast();
  const [users, setUsers] = useState<{ id: string; username: string; fullName: string; role: string; isActive: boolean }[] | null>(null);
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<string>("DOCTOR");
  const [password, setPassword] = useState("");

  const load = useCallback(() => {
    api.users().then((r) => setUsers(r.items)).catch(() => setUsers([]));
  }, []);
  useEffect(load, [load]);

  const create = async () => {
    try {
      await api.createUser({ username, fullName, role, password });
      toast(t("common.saved"), "success");
      setOpen(false); setUsername(""); setFullName(""); setPassword("");
      load();
    } catch (err) {
      toast(err instanceof ApiProblem ? err.message : t("common.error"), "danger");
    }
  };

  const toggleActive = async (user: { id: string; isActive: boolean }) => {
    try {
      await api.updateUser(user.id, { isActive: !user.isActive });
      load();
    } catch (err) {
      toast(err instanceof ApiProblem ? err.message : t("common.error"), "danger");
    }
  };

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button variant="action" arrow onClick={() => setOpen(true)}>{t("admin.addUser")}</Button>
      </div>
      {users === null ? (
        <p aria-busy="true" className="font-mono text-2xs text-ink-faint">{t("common.loading")}…</p>
      ) : (
        <DataTable
          caption={t("admin.users")}
          rows={users}
          columns={[
            { key: "name", header: t("common.name"), render: (u) => <strong className="text-ink">{u.fullName}</strong> },
            { key: "username", header: t("login.username"), render: (u) => <span className="font-mono text-2xs">{u.username}</span> },
            { key: "role", header: t("admin.role"), render: (u) => t(`admin.role.${u.role}` as "admin.role.ADMIN") },
            { key: "status", header: t("common.status"), render: (u) => <StateLabel tone={u.isActive ? "good" : "neutral"}>{u.isActive ? t("admin.active") : t("admin.inactive")}</StateLabel> },
            {
              key: "actions",
              header: "",
              width: "110px",
              render: (u) =>
                u.id === profile?.userId ? (
                  <span className="font-mono text-2xs text-ink-faint">—</span>
                ) : (
                  <button type="button" className="font-mono text-2xs text-moss hover:underline" onClick={() => void toggleActive(u)}>
                    {u.isActive ? "deactivate" : "activate"}
                  </button>
                ),
            },
          ]}
        />
      )}
      <Modal open={open} onClose={() => setOpen(false)} kicker={t("admin.addUser").toUpperCase()} title={t("admin.addUser")}
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
          <Button variant="action" disabled={!username || !fullName || password.length < 12} onClick={() => void create()}>{t("common.create")}</Button></>}>
        <Input label={t("login.username")} value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} hint="letters, digits, dot, underscore, dash" />
        <Input label={t("common.name")} value={fullName} onChange={(e) => setFullName(e.target.value)} />
        <Select label={t("admin.role")} value={role} onChange={(e) => setRole(e.target.value)}>
          {ROLES.map((r) => <option key={r} value={r}>{t(`admin.role.${r}` as "admin.role.ADMIN")}</option>)}
        </Select>
        <Input label={t("settings.newPassword")} type="password" value={password} onChange={(e) => setPassword(e.target.value)} hint={t("settings.passwordHint")} />
      </Modal>
    </div>
  );
};

// ------------------------------------------------------------------ clinic

const ClinicTab = () => {
  const { t, locale, setLocale } = useI18n();
  const { refresh } = useSession();
  const { toast } = useToast();
  const [clinic, setClinic] = useState<Awaited<ReturnType<typeof api.clinic>> | null>(null);

  useEffect(() => {
    api.clinic().then(setClinic).catch(() => setClinic(null));
  }, []);

  if (!clinic) return <p aria-busy="true" className="font-mono text-2xs text-ink-faint">{t("common.loading")}…</p>;

  const save = async () => {
    try {
      await api.updateClinic({
        name: clinic.name,
        locale: clinic.locale,
        timezone: clinic.timezone,
        currency: clinic.currency,
        retentionYears: clinic.retentionYears,
        address: clinic.address ?? undefined,
        phone: clinic.phone ?? undefined,
        email: clinic.email ?? undefined,
      });
      setLocale(clinic.locale === locale ? locale : (clinic.locale as typeof locale));
      await refresh();
      toast(t("common.saved"), "success");
    } catch (err) {
      toast(err instanceof ApiProblem ? err.message : t("common.error"), "danger");
    }
  };

  return (
    <div className="max-w-xl">
      <Input label={t("admin.clinicName")} value={clinic.name} onChange={(e) => setClinic({ ...clinic, name: e.target.value })} />
      <div className="grid grid-cols-2 gap-5">
        <Select label={t("admin.locale")} value={clinic.locale} onChange={(e) => setClinic({ ...clinic, locale: e.target.value })}>
          {["en-CH", "de-CH", "fr-CH", "it-CH"].map((l) => <option key={l} value={l}>{l}</option>)}
        </Select>
        <Select label={t("admin.timezone")} value={clinic.timezone} onChange={(e) => setClinic({ ...clinic, timezone: e.target.value })}>
          {["Europe/Zurich", "Europe/London", "UTC"].map((z) => <option key={z} value={z}>{z}</option>)}
        </Select>
        <Select label={t("admin.currency")} value={clinic.currency} onChange={(e) => setClinic({ ...clinic, currency: e.target.value })}>
          {["CHF", "EUR", "USD"].map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
        <Input label={t("admin.retention")} type="number" min={1} max={50} value={clinic.retentionYears}
          onChange={(e) => setClinic({ ...clinic, retentionYears: Number(e.target.value) })} />
      </div>
      <Input label={`${t("patients.phone")} (${t("common.optional")})`} value={clinic.phone ?? ""} onChange={(e) => setClinic({ ...clinic, phone: e.target.value })} />
      <Input label={`${t("patients.email")} (${t("common.optional")})`} type="email" value={clinic.email ?? ""} onChange={(e) => setClinic({ ...clinic, email: e.target.value })} />
      <Input label={`${t("patients.address")} (${t("common.optional")})`} value={clinic.address ?? ""} onChange={(e) => setClinic({ ...clinic, address: e.target.value })} />
      <Button variant="action" onClick={() => void save()}>{t("common.save")}</Button>
    </div>
  );
};

// ----------------------------------------------------------------- privacy

const DSAR_TYPES = ["ACCESS", "EXPORT", "RECTIFICATION", "OBJECTION", "RESTRICTION"] as const;

const PrivacyTab = () => {
  const { t, locale } = useI18n();
  const { toast } = useToast();
  const [items, setItems] = useState<DsarRequest[] | null>(null);
  const [open, setOpen] = useState(false);
  const [patientQuery, setPatientQuery] = useState("");
  const [patientId, setPatientId] = useState("");
  const [patientName, setPatientName] = useState("");
  const [results, setResults] = useState<{ id: string; fullName: string; internalRef: string }[]>([]);
  const [type, setType] = useState<string>("EXPORT");

  const load = useCallback(() => {
    api.dsar().then((r) => setItems(r.items)).catch(() => setItems([]));
  }, []);
  useEffect(load, [load]);

  useEffect(() => {
    if (!open || patientId) return;
    const q = patientQuery.trim();
    if (q.length < 2) return setResults([]);
    const timer = setTimeout(() => {
      api.patients({ q, limit: 5 }).then((r) => setResults(r.items)).catch(() => setResults([]));
    }, 220);
    return () => clearTimeout(timer);
  }, [patientQuery, open, patientId]);

  const create = async () => {
    try {
      await api.createDsar({ patientId, type });
      toast(t("common.saved"), "success");
      setOpen(false); setPatientId(""); setPatientQuery("");
      load();
    } catch (err) {
      toast(err instanceof ApiProblem ? err.message : t("common.error"), "danger");
    }
  };

  const fulfill = async (d: DsarRequest) => {
    try {
      await api.setDsarStatus(d.id, "FULFILLED");
      load();
    } catch (err) {
      toast(err instanceof ApiProblem ? err.message : t("common.error"), "danger");
    }
  };

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button variant="action" arrow onClick={() => setOpen(true)}>{t("admin.dsarNew")}</Button>
      </div>
      {items === null ? (
        <p aria-busy="true" className="font-mono text-2xs text-ink-faint">{t("common.loading")}…</p>
      ) : (
        <DataTable<DsarRequest>
          caption={t("admin.privacy")}
          rows={items}
          columns={[
            { key: "patient", header: t("billing.patient"), render: (d) => <strong className="text-ink">{d.patientName}</strong> },
            { key: "type", header: t("admin.dsarType"), render: (d) => <span className="font-mono text-2xs">{d.type}</span> },
            { key: "due", header: t("admin.dsarDue"), render: (d) => formatDate(d.dueAt, locale) },
            { key: "status", header: t("common.status"), render: (d) => <StateLabel tone={d.status === "FULFILLED" ? "good" : d.status === "REJECTED" ? "alert" : "review"}>{d.status}</StateLabel> },
            {
              key: "actions",
              header: "",
              width: "170px",
              render: (d) => (
                <span className="flex gap-3 justify-end">
                  {d.status !== "FULFILLED" && d.status !== "REJECTED" ? (
                    <button type="button" className="font-mono text-2xs text-moss hover:underline" onClick={() => void fulfill(d)}>
                      {t("admin.dsarFulfill")}
                    </button>
                  ) : null}
                  {d.type === "EXPORT" ? (
                    <a className="font-mono text-2xs text-navy hover:underline" href={api.dsarExportUrl(d.patientId)} download>
                      {t("admin.dsarExport")}
                    </a>
                  ) : null}
                </span>
              ),
            },
          ]}
        />
      )}
      <Modal open={open} onClose={() => setOpen(false)} kicker={t("admin.privacy").toUpperCase()} title={t("admin.dsarNew")}
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
          <Button variant="action" disabled={!patientId} onClick={() => void create()}>{t("common.create")}</Button></>}>
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
        <Select label={t("admin.dsarType")} value={type} onChange={(e) => setType(e.target.value)}>
          {DSAR_TYPES.map((ty) => <option key={ty} value={ty}>{ty.toLowerCase()}</option>)}
        </Select>
      </Modal>
    </div>
  );
};

// ---------------------------------------------------------------------- ai

const AiTab = () => {
  const { t } = useI18n();
  const { toast } = useToast();
  const [prompts, setPrompts] = useState<PromptTemplate[]>([]);
  const [scribe, setScribe] = useState("");
  const [chat, setChat] = useState("");

  useEffect(() => {
    api.prompts().then((r) => {
      setPrompts(r.items);
      setScribe(r.items.find((p) => p.name === "SCRIBE_NOTE")?.template ?? "");
      setChat(r.items.find((p) => p.name === "CHAT_ASSISTANT")?.template ?? "");
    }).catch(() => setPrompts([]));
  }, []);

  const save = async (name: string, template: string) => {
    try {
      await api.updatePrompt(name, template);
      toast(`${name} · ${t("common.saved")}`, "success");
      const r = await api.prompts();
      setPrompts(r.items);
    } catch (err) {
      toast(err instanceof ApiProblem ? err.message : t("common.error"), "danger");
    }
  };

  const versionOf = (name: string) => prompts.find((p) => p.name === name)?.version;

  return (
    <div className="max-w-2xl space-y-8">
      <Banner tone="info">{t("admin.promptNote")}</Banner>
      <div>
        <Kicker>{t("admin.promptScibe").toUpperCase()} {versionOf("SCRIBE_NOTE") ? `· v${versionOf("SCRIBE_NOTE")}` : ""}</Kicker>
        <div className="mt-3">
          <Textarea label="" rows={6} value={scribe} onChange={(e) => setScribe(e.target.value)} />
        </div>
        <Button variant="action" className="mt-3" onClick={() => void save("SCRIBE_NOTE", scribe)}>{t("admin.promptSave")}</Button>
      </div>
      <div>
        <Kicker>{t("admin.promptChat").toUpperCase()} {versionOf("CHAT_ASSISTANT") ? `· v${versionOf("CHAT_ASSISTANT")}` : ""}</Kicker>
        <div className="mt-3">
          <Textarea label="" rows={6} value={chat} onChange={(e) => setChat(e.target.value)} />
        </div>
        <Button variant="action" className="mt-3" onClick={() => void save("CHAT_ASSISTANT", chat)}>{t("admin.promptSave")}</Button>
      </div>
    </div>
  );
};

// ------------------------------------------------------------ availability

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const AvailabilityTab = () => {
  const { t } = useI18n();
  const { toast } = useToast();
  const [rules, setRules] = useState<{ id: string; doctorId: string; doctorName: string; weekday: number; startMinute: number; endMinute: number }[] | null>(null);
  const [doctors, setDoctors] = useState<{ id: string; fullName: string }[]>([]);
  const [doctorId, setDoctorId] = useState("");
  const [weekday, setWeekday] = useState(1);
  const [from, setFrom] = useState("08:00");
  const [to, setTo] = useState("17:00");

  const load = useCallback(() => {
    Promise.all([api.availability(), api.doctors()])
      .then(([r, d]) => {
        setRules(r.items);
        setDoctors(d.items);
        setDoctorId((prev) => prev || d.items[0]?.id || "");
      })
      .catch(() => setRules([]));
  }, []);
  useEffect(load, [load]);

  const toMinutes = (hhmm: string): number => {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
  };
  const toHHMM = (min: number): string => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

  const save = async () => {
    try {
      await api.setAvailability({
        doctorId,
        weekday,
        startMinute: toMinutes(from),
        endMinute: toMinutes(to),
      });
      toast(t("common.saved"), "success");
      load();
    } catch (err) {
      toast(err instanceof ApiProblem ? err.message : t("common.error"), "danger");
    }
  };

  return (
    <div>
      <div className="max-w-lg mb-8 border border-rule p-5">
        <Kicker>{t("admin.availability").toUpperCase()}</Kicker>
        <div className="grid grid-cols-2 gap-5 mt-3">
          <Select label={t("agenda.doctor")} value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
            {doctors.map((d) => <option key={d.id} value={d.id}>{d.fullName}</option>)}
          </Select>
          <Select label={t("admin.weekday")} value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
            {WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
          </Select>
          <Input label={t("admin.from")} type="time" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input label={t("admin.to")} type="time" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <Button variant="action" className="mt-3" onClick={() => void save()}>{t("common.save")}</Button>
      </div>
      {rules === null ? (
        <p aria-busy="true" className="font-mono text-2xs text-ink-faint">{t("common.loading")}…</p>
      ) : (
        <DataTable
          caption={t("admin.availability")}
          rows={rules}
          columns={[
            { key: "doctor", header: t("agenda.doctor"), render: (r) => <strong className="text-ink">{r.doctorName}</strong> },
            { key: "day", header: t("admin.weekday"), render: (r) => WEEKDAYS[r.weekday] },
            { key: "hours", header: t("common.time"), render: (r) => `${toHHMM(r.startMinute)} – ${toHHMM(r.endMinute)}` },
          ]}
        />
      )}
    </div>
  );
};
