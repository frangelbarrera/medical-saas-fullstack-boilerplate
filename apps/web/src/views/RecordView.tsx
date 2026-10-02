/**
 * Clinical record workspace: editorial patient header, tabbed record
 * (Overview / Timeline / Encounters / Problems / Medication / Allergies /
 * Results / Audit), encounter editor with the DRAFT -> IN_REVIEW -> SIGNED
 * -> AMENDED lifecycle, AI draft annotation and the break-glass gate for
 * administrative access.
 */
import { useCallback, useEffect, useState } from "react";
import type {
  Allergy,
  AuditEvent,
  ClinicalSummary,
  Encounter,
  EncounterVersionInfo,
  MedicationOrder,
  Observation,
  PatientDetail,
  Problem,
  TimelineEvent,
} from "@medical/contracts";
import { api, ApiProblem } from "../lib/api.js";
import { useSession } from "../auth/index.js";
import { useI18n } from "../i18n/index.js";
import { formatDate, formatDateTime } from "../lib/format.js";
import {
  AiNote,
  Banner,
  Button,
  ConfirmDialog,
  DataTable,
  EmptyState,
  Field,
  Input,
  Kicker,
  Modal,
  Select,
  Skeleton,
  StateLabel,
  Tabs,
  Textarea,
  useToast,
} from "@medical/ui";
import { navigate } from "../routes.js";

type RecordTab = "overview" | "timeline" | "encounters" | "problems" | "medication" | "allergies" | "results" | "audit";

export const RecordView = ({ patientId }: { patientId: string }) => {
  const { t, locale } = useI18n();
  const { can } = useSession();
  const { toast } = useToast();
  const [patient, setPatient] = useState<PatientDetail | null>(null);
  const [summary, setSummary] = useState<ClinicalSummary | null>(null);
  const [tab, setTab] = useState<RecordTab>("overview");
  const [editingEncounter, setEditingEncounter] = useState<Encounter | null>(null);
  const [encountersKey, setEncountersKey] = useState(0);
  const [breakGlassNeeded, setBreakGlassNeeded] = useState(false);
  const [breakGlassReason, setBreakGlassReason] = useState("");
  /** Access gate from the governed 403s (safe meta: name + internalRef only). */
  const [gate, setGate] = useState<{ kind: "BREAK_GLASS" | "CARE_RELATIONSHIP"; name: string; internalRef: string } | null>(null);
  const [failed, setFailed] = useState(false);

  const clinicalAccess = can("clinical:read");

  const loadCore = useCallback(async () => {
    try {
      const p = await api.patient(patientId);
      setPatient(p);
      setGate(null);
    } catch (err) {
      if (
        err instanceof ApiProblem &&
        (err.code === "BREAK_GLASS_REQUIRED" || err.code === "CARE_RELATIONSHIP_REQUIRED")
      ) {
        setGate({
          kind: err.code === "BREAK_GLASS_REQUIRED" ? "BREAK_GLASS" : "CARE_RELATIONSHIP",
          name: String(err.meta?.name ?? ""),
          internalRef: String(err.meta?.internalRef ?? ""),
        });
      } else {
        setFailed(true);
      }
    }
  }, [patientId]);

  const loadClinical = useCallback(async () => {
    try {
      const s = await api.summary(patientId);
      setSummary(s);
    } catch (err) {
      if (err instanceof ApiProblem && err.code === "BREAK_GLASS_REQUIRED") {
        setBreakGlassNeeded(true);
      } else {
        toast(t("common.error"), "danger");
      }
    }
  }, [patientId, t, toast]);

  useEffect(() => {
    void loadCore();
  }, [loadCore]);

  useEffect(() => {
    if (clinicalAccess && !breakGlassNeeded) void loadClinical();
  }, [clinicalAccess, breakGlassNeeded, loadClinical]);

  // Declared before the early returns below: the break-glass gate JSX
  // references this handler, and a const declaration after the return
  // would leave the binding in the temporal dead zone at click time
  // (crash: "Cannot access ... before initialization" in the bundle).
  const grantBreakGlass = async () => {
    try {
      await api.breakGlass(patientId, breakGlassReason);
      setBreakGlassNeeded(false);
      setBreakGlassReason("");
      setGate(null);
      await loadCore();
      await loadClinical();
      toast(t("record.breakGlassConfirm"), "warning");
    } catch (err) {
      toast(err instanceof ApiProblem ? err.message : t("common.error"), "danger");
    }
  };

  if (failed) {
    return <EmptyState title={t("patients.noResults")} body={t("patients.noResultsBody")} action={<Button onClick={() => navigate("/patients")}>{t("patients.title")}</Button>} />;
  }
  // Governed access gate: the 403 meta carries the directory-visible identity
  // (name + internal ref) and never any contact PHI.
  if (gate) {
    return (
      <section aria-label={gate.name}>
        <header className="mb-8">
          <Kicker>PATIENT / {t("patients.internalId").toUpperCase()} {gate.internalRef}</Kicker>
          <h1 className="font-serif text-4xl m-0 text-ink mt-2">{gate.name}</h1>
        </header>
        {gate.kind === "BREAK_GLASS" ? (
          <div className="border border-signal bg-signal-tint p-6">
            <h2 className="font-serif text-lg mt-0 mb-2 text-signal">{t("record.breakGlassTitle")}</h2>
            <p className="text-sm text-ink-soft mt-0 mb-4 max-w-lg">{t("record.breakGlassBody")}</p>
            <div className="flex gap-2 items-end">
              <div className="flex-1 max-w-md">
                <Field label={t("record.breakGlassReason")} htmlFor="bg-reason">
                  <input id="bg-reason" className="w-full bg-transparent border-b border-ink py-1.5 text-sm focus:outline-none"
                    value={breakGlassReason} onChange={(e) => setBreakGlassReason(e.target.value)} />
                </Field>
              </div>
              <Button variant="danger" disabled={breakGlassReason.trim().length < 10} onClick={() => void grantBreakGlass()}>
                {t("record.breakGlassConfirm")}
              </Button>
            </div>
          </div>
        ) : (
          <Banner tone="warning">{t("record.careRelationshipNeeded")}</Banner>
        )}
      </section>
    );
  }
  if (!patient) {
    return <div aria-busy="true"><Skeleton className="h-28 w-2/3" /><Skeleton className="h-96 w-full mt-8" /></div>;
  }

  const consent = patient.consents.find((c) => c.type === "TREATMENT");
  const allergyWarning = summary?.allergies.some((a) => a.status === "ACTIVE" && a.severity === "SEVERE");

  const tabs: { id: RecordTab; label: string }[] = clinicalAccess
    ? [
        { id: "overview", label: t("record.overview") },
        { id: "timeline", label: t("record.timeline") },
        { id: "encounters", label: t("record.encounters") },
        { id: "problems", label: t("record.problems") },
        { id: "medication", label: t("record.medications") },
        { id: "allergies", label: t("record.allergies") },
        { id: "results", label: t("record.results") },
        { id: "audit", label: t("record.audit") },
      ]
    : [{ id: "overview", label: t("record.overview") }];

  return (
    <section aria-label={patient.fullName}>
      <header className="flex items-center justify-between gap-6 mb-8 max-md:flex-col max-md:items-start">
        <div>
          <Kicker>PATIENT / {t("patients.internalId").toUpperCase()} {patient.internalRef}</Kicker>
          <h1 className="font-serif text-4xl m-0 text-ink mt-2">{patient.fullName}</h1>
          <p className="text-xs text-ink-soft mt-2.5 mb-0 flex flex-wrap gap-x-2">
            <span>{patient.birthDate ? `${t("patients.birthYear")} ${patient.birthDate.slice(0, 4)}` : "—"}</span>
            <span aria-hidden="true" className="text-ink-faint">·</span>
            <span>{patient.sex ? t(`patients.sex.${patient.sex}` as "patients.sex.female") : "—"}</span>
            <span aria-hidden="true" className="text-ink-faint">·</span>
            {consent?.status === "GRANTED" ? (
              <b className="text-moss font-semibold">{t("record.consentCurrent")}</b>
            ) : (
              <b className="text-signal font-semibold">{t("record.consentMissing")}</b>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          {can("clinical:write") && !breakGlassNeeded ? (
            <Button variant="action" arrow onClick={() => setEditingEncounter({ id: "", title: "" } as Encounter)}>
              {t("record.newEncounter")}
            </Button>
          ) : null}
        </div>
      </header>

      {allergyWarning ? <div className="mb-6"><Banner tone="danger">{summary?.allergies.filter((a) => a.severity === "SEVERE").map((a) => a.substance).join(", ")}</Banner></div> : null}

      {breakGlassNeeded ? (
        <div className="border border-signal bg-signal-tint p-6">
          <h2 className="font-serif text-lg mt-0 mb-2 text-signal">{t("record.breakGlassTitle")}</h2>
          <p className="text-sm text-ink-soft mt-0 mb-4 max-w-lg">{t("record.breakGlassBody")}</p>
          <div className="flex gap-2 items-end">
            <div className="flex-1 max-w-md">
              <Field label={t("record.breakGlassReason")} htmlFor="bg-reason">
                <input id="bg-reason" className="w-full bg-transparent border-b border-ink py-1.5 text-sm focus:outline-none"
                  value={breakGlassReason} onChange={(e) => setBreakGlassReason(e.target.value)} />
              </Field>
            </div>
            <Button variant="danger" disabled={breakGlassReason.trim().length < 10} onClick={() => void grantBreakGlass()}>
              {t("record.breakGlassConfirm")}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <Tabs tabs={tabs} active={tab} onChange={setTab} label={t("record.overview")} />
          <div className="mt-8">
            {!clinicalAccess ? (
              <IntakePanel patient={patient} locale={locale} t={t} />
            ) : tab === "overview" ? (
              <OverviewTab patient={patient} summary={summary} locale={locale} t={t} />
            ) : tab === "timeline" ? (
              <TimelineTab patientId={patientId} t={t} locale={locale} />
            ) : tab === "encounters" ? (
              <EncountersTab patientId={patientId} onEdit={setEditingEncounter} t={t} locale={locale} canSign={can("clinical:sign")} canWrite={can("clinical:write")} refreshKey={encountersKey} />
            ) : tab === "problems" ? (
              <ProblemsTab patientId={patientId} t={t} />
            ) : tab === "medication" ? (
              <MedicationTab patientId={patientId} t={t} />
            ) : tab === "allergies" ? (
              <AllergiesTab patientId={patientId} t={t} />
            ) : tab === "results" ? (
              <ResultsTab patientId={patientId} t={t} locale={locale} />
            ) : (
              <AuditTab patientId={patientId} t={t} locale={locale} />
            )}
          </div>
        </>
      )}

      {editingEncounter ? (
        <EncounterEditor
          patientId={patientId}
          encounter={editingEncounter.id ? editingEncounter : null}
          onClose={() => setEditingEncounter(null)}
          onSaved={async () => {
            setEditingEncounter(null);
            setEncountersKey((k) => k + 1);
            await loadClinical();
          }}
        />
      ) : null}
    </section>
  );
};

// ---------------------------------------------------------------- helpers

type T = (key: import("../i18n/locales/en.js").TranslationKey) => string;

const NoteBlock = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="grid grid-cols-[140px_1fr] gap-7 py-4 border-b border-rule max-sm:grid-cols-1 max-sm:gap-2">
    <div className="font-mono text-2xs text-ink-faint uppercase">{label}</div>
    <div className="text-sm leading-relaxed text-ink whitespace-pre-wrap">{children || "—"}</div>
  </div>
);

const RailSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="pb-5 mb-5 border-b border-rule last:border-0">
    <Kicker>{title.toUpperCase()}</Kicker>
    <div className="mt-2 text-sm font-semibold text-ink">{children}</div>
  </div>
);

// ---------------------------------------------------------------- overview

const OverviewTab = ({ patient, summary, locale, t }: { patient: PatientDetail; summary: ClinicalSummary | null; locale: string; t: T }) => (
  <div className="grid grid-cols-[minmax(0,1.55fr)_270px] gap-16 max-lg:grid-cols-1">
    <div>
      <h2 className="font-serif text-xl m-0 border-b-2 border-ink pb-3">{t("record.overview")}</h2>
      <div className="mt-1">
        <NoteBlock label={t("patients.phone")}>{patient.phone ?? "—"}</NoteBlock>
        <NoteBlock label={t("patients.email")}>{patient.email ?? "—"}</NoteBlock>
        <NoteBlock label={t("patients.address")}>{patient.address ?? "—"}</NoteBlock>
        <NoteBlock label={t("patients.identifiers")}>
          {patient.identifiers.length
            ? patient.identifiers.map((i) => `${i.type.replace(/_/g, " ").toLowerCase()}: ${i.value}`).join(" · ")
            : "—"}
        </NoteBlock>
        <NoteBlock label={t("record.lastVerified")}>{formatDateTime(patient.updatedAt, locale)}</NoteBlock>
      </div>
    </div>
    <aside>
      <RailSection title={t("record.activeProblems")}>
        {summary && summary.activeProblems.length > 0 ? (
          <ul className="list-none m-0 p-0 space-y-2">
            {summary.activeProblems.map((p) => (
              <li key={p.id}>
                <span className="block text-sm font-semibold text-ink">{p.display}</span>
                <span className="block font-mono text-2xs text-ink-faint mt-0.5">{p.code} · {formatDate(p.onsetDate, locale)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <span className="font-mono text-2xs text-ink-faint font-normal">—</span>
        )}
      </RailSection>
      <RailSection title={t("record.allergies")}>
        {summary && summary.allergies.length > 0 ? (
          <ul className="list-none m-0 p-0 space-y-1">
            {summary.allergies.filter((a) => a.status === "ACTIVE").map((a) => (
              <li key={a.id} className={a.severity === "SEVERE" ? "text-signal" : ""}>
                {a.substance}{a.reaction ? ` · ${a.reaction}` : ""}
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-moss">{t("record.noKnownAllergies")}</span>
        )}
      </RailSection>
      <RailSection title={t("record.activeMedication")}>
        {summary && summary.activeMedications.length > 0 ? (
          <ul className="list-none m-0 p-0 space-y-1">
            {summary.activeMedications.map((m) => (
              <li key={m.id}>{m.medicationName}{m.dose ? ` · ${m.dose}` : ""}</li>
            ))}
          </ul>
        ) : (
          <span className="font-mono text-2xs text-ink-faint font-normal">—</span>
        )}
      </RailSection>
    </aside>
  </div>
);

// secretaries see the intake panel (no clinical capability)
const IntakePanel = ({ patient, locale, t }: { patient: PatientDetail; locale: string; t: T }) => (
  <div className="max-w-xl">
    <h2 className="font-serif text-xl m-0 border-b-2 border-ink pb-3">{t("patients.title")}</h2>
    <div className="mt-1">
      <NoteBlock label={t("patients.phone")}>{patient.phone ?? "—"}</NoteBlock>
      <NoteBlock label={t("patients.email")}>{patient.email ?? "—"}</NoteBlock>
      <NoteBlock label={t("patients.address")}>{patient.address ?? "—"}</NoteBlock>
      <NoteBlock label={t("patients.identifiers")}>
        {patient.identifiers.map((i) => `${i.type.replace(/_/g, " ").toLowerCase()}: ${i.value}`).join(" · ") || "—"}
      </NoteBlock>
      <NoteBlock label={t("common.status")}>{formatDate(patient.updatedAt, locale)}</NoteBlock>
    </div>
  </div>
);

// ---------------------------------------------------------------- timeline

const TimelineTab = ({ patientId, t, locale }: { patientId: string; t: T; locale: string }) => {
  const [events, setEvents] = useState<TimelineEvent[] | null>(null);
  useEffect(() => {
    api.timeline(patientId).then((r) => setEvents(r.items)).catch(() => setEvents([]));
  }, [patientId]);
  if (!events) return <p aria-busy="true" className="font-mono text-2xs text-ink-faint">{t("common.loading")}…</p>;
  if (events.length === 0) return <EmptyState title={t("record.noEncounters")} body={t("record.noEncountersBody")} />;
  return (
    <ol className="list-none m-0 p-0">
      {events.map((e) => (
        <li key={e.id} className="grid grid-cols-[130px_1fr] gap-6 py-3.5 border-b border-rule max-sm:grid-cols-1 max-sm:gap-1">
          <time className="font-mono text-2xs text-ink-faint">{formatDateTime(e.occurredAt, locale)}</time>
          <div>
            <span className="text-sm text-ink">{e.title}</span>
            <span className="font-mono text-2xs text-ink-faint ml-2">{e.kind.toLowerCase()}</span>
            {e.status ? <span className="ml-2"><StateLabel tone={e.status === "SIGNED" ? "signed" : "neutral"}>{e.status}</StateLabel></span> : null}
            {e.detail ? <span className="block text-xs text-ink-soft mt-1">{e.detail}</span> : null}
          </div>
        </li>
      ))}
    </ol>
  );
};

// --------------------------------------------------------------- encounters

const EncountersTab = ({
  patientId,
  onEdit,
  t,
  locale,
  canSign,
  canWrite,
  refreshKey,
}: {
  patientId: string;
  onEdit: (e: Encounter) => void;
  t: T;
  locale: string;
  canSign: boolean;
  canWrite: boolean;
  refreshKey: number;
}) => {
  const { toast } = useToast();
  const [encounters, setEncounters] = useState<Encounter[] | null>(null);
  const load = useCallback(() => {
    api.encounters(patientId).then((r) => setEncounters(r.items)).catch(() => setEncounters([]));
  }, [patientId]);
  useEffect(load, [load, refreshKey]);

  if (!encounters) return <p aria-busy="true" className="font-mono text-2xs text-ink-faint">{t("common.loading")}…</p>;
  if (encounters.length === 0) return <EmptyState title={t("record.noEncounters")} body={t("record.noEncountersBody")} />;

  return (
    <DataTable<Encounter>
      caption={t("record.encounters")}
      rows={encounters}
      onRowClick={canWrite ? onEdit : undefined}
      columns={[
        {
          key: "date",
          header: t("common.date"),
          render: (e) => <span className="font-mono text-2xs">{formatDate(e.createdAt, locale)}</span>,
        },
        { key: "title", header: t("common.name"), render: (e) => <strong className="text-ink">{e.title}</strong> },
        { key: "doctor", header: t("agenda.doctor"), render: (e) => e.doctorName },
        {
          key: "status",
          header: t("common.status"),
          render: (e) => (
            <StateLabel tone={e.status === "SIGNED" ? "signed" : e.status === "AMENDED" ? "amended" : e.status === "IN_REVIEW" ? "review" : "draft"}>
              {t(`record.state.${e.status}` as "record.state.DRAFT")}
            </StateLabel>
          ),
        },
        {
          key: "actions",
          header: "",
          width: "150px",
          render: (e) => (
            <span className="flex gap-2 justify-end">
              {canSign && e.status !== "SIGNED" && e.status !== "AMENDED" ? (
                <button
                  type="button"
                  className="font-mono text-2xs text-moss hover:underline"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    api.signEncounter(e.id)
                      .then(() => {
                        toast(t("record.state.SIGNED"), "success");
                        load();
                      })
                      .catch((err) => toast(err.message, "danger"));
                  }}
                >
                  {t("record.sign")}
                </button>
              ) : null}
            </span>
          ),
        },
      ]}
    />
  );
};

// ----------------------------------------------------------- encounter editor

const EncounterEditor = ({
  patientId,
  encounter,
  onClose,
  onSaved,
}: {
  patientId: string;
  encounter: Encounter | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) => {
  const { t } = useI18n();
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [chiefComplaint, setChief] = useState("");
  const [observations, setObservations] = useState("");
  const [plan, setPlan] = useState("");
  const [current, setCurrent] = useState<Encounter | null>(encounter);
  const [versions, setVersions] = useState<EncounterVersionInfo[]>([]);
  const [draftBusy, setDraftBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [amendOpen, setAmendOpen] = useState(false);
  const [amendReason, setAmendReason] = useState("");

  useEffect(() => {
    if (encounter) {
      setTitle(encounter.title);
      setChief(encounter.chiefComplaint ?? "");
      setObservations(encounter.observations ?? "");
      setPlan(encounter.plan ?? "");
      setCurrent(encounter);
      api.encounterVersions(encounter.id).then((r) => setVersions(r.items)).catch(() => setVersions([]));
    }
  }, [encounter]);

  const save = async (): Promise<boolean> => {
    if (!current) return false;
    setBusy(true);
    try {
      const updated = await api.updateEncounter(current.id, { title, chiefComplaint, observations, plan });
      setCurrent(updated);
      return true;
    } catch (err) {
      toast(err instanceof ApiProblem ? err.message : t("common.error"), "danger");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    setBusy(true);
    try {
      const created = await api.createEncounter({ patientId, title, chiefComplaint, observations, plan });
      setCurrent(created);
      toast(t("common.saved"), "success");
      await onSaved();
    } catch (err) {
      toast(err instanceof ApiProblem ? err.message : t("common.error"), "danger");
    } finally {
      setBusy(false);
    }
  };

  const submitForSignature = async () => {
    if (!current || !(await save())) return;
    try {
      const updated = await api.submitEncounter(current.id);
      setCurrent(updated);
      toast(t("record.state.IN_REVIEW"), "success");
      await onSaved();
    } catch (err) {
      toast(err instanceof ApiProblem ? err.message : t("common.error"), "danger");
    }
  };

  const sign = async () => {
    if (!current) return;
    try {
      await api.signEncounter(current.id);
      toast(t("record.state.SIGNED"), "success");
      await onSaved();
    } catch (err) {
      toast(err instanceof ApiProblem ? err.message : t("common.error"), "danger");
    }
  };

  const amend = async () => {
    if (!current) return;
    try {
      await api.amendEncounter(current.id, amendReason);
      setAmendOpen(false);
      toast(t("record.state.AMENDED"), "success");
      await onSaved();
    } catch (err) {
      toast(err instanceof ApiProblem ? err.message : t("common.error"), "danger");
    }
  };

  const generateDraft = async () => {
    if (!current) return;
    setDraftBusy(true);
    try {
      const draft = await api.scribeDraft(current.id);
      // Show the draft as an editorial annotation; insertion is explicit.
      setCurrentDraft(draft.content);
    } catch (err) {
      toast(err instanceof ApiProblem ? (err.code === "AI_NOT_ENABLED" ? err.message : err.message) : t("common.error"), "warning");
    } finally {
      setDraftBusy(false);
    }
  };

  const [aiDraft, setCurrentDraft] = useState<{ chiefComplaint: string; observations: string; plan: string } | null>(null);

  const insertDraft = () => {
    if (!aiDraft) return;
    setChief(aiDraft.chiefComplaint);
    setObservations(aiDraft.observations);
    setPlan(aiDraft.plan);
    setCurrentDraft(null);
  };

  const readonly = current?.status === "SIGNED" || current?.status === "AMENDED";

  return (
    <Modal
      open
      onClose={onClose}
      kicker={current ? `ENCOUNTER / ${formatDate(current.createdAt, "en-CH")} · v${current.currentVersion}` : t("record.newEncounter").toUpperCase()}
      title={title || t("record.newEncounter")}
      wide
      footer={
        current ? (
          <>
            <span className="mr-auto font-mono text-2xs text-ink-faint">{t("record.autosave")}</span>
            {readonly ? (
              <>
                <Button variant="outline" onClick={() => setAmendOpen(true)}>{t("record.amend")}</Button>
              </>
            ) : (
              <>
                <Button variant="ghost" disabled={busy} onClick={() => void save()}>{t("record.saveDraft")}</Button>
                <Button variant="outline" onClick={() => void submitForSignature()}>{t("record.submitSignature")}</Button>
                <Button variant="action" arrow onClick={() => void sign()}>{t("record.sign")}</Button>
              </>
            )}
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
            <Button variant="action" disabled={busy || !title.trim()} onClick={() => void create()}>{t("common.create")}</Button>
          </>
        )
      }
    >
      {current ? (
        <div className="flex items-center justify-between mb-5">
          <StateLabel tone={current.status === "SIGNED" ? "signed" : current.status === "AMENDED" ? "amended" : current.status === "IN_REVIEW" ? "review" : "draft"}>
            {t(`record.state.${current.status}` as "record.state.DRAFT")}
          </StateLabel>
          <span className="font-mono text-2xs text-ink-faint">
            {current.signedAt ? `${t("record.sign")}: ${current.signedByName} · ${formatDateTime(current.signedAt, "en-CH")}` : `v${current.currentVersion}`}
          </span>
        </div>
      ) : null}

      <Input label={t("common.name")} value={title} onChange={(e) => setTitle(e.target.value)} disabled={readonly} />
      <Textarea label={t("record.chiefComplaint")} rows={2} value={chiefComplaint} onChange={(e) => setChief(e.target.value)} disabled={readonly} />
      <Textarea label={t("record.observations")} rows={5} value={observations} onChange={(e) => setObservations(e.target.value)} disabled={readonly} />
      <Textarea label={t("record.plan")} rows={4} value={plan} onChange={(e) => setPlan(e.target.value)} disabled={readonly} />

      {aiDraft ? (
        <AiNote onInsert={insertDraft} onDiscard={() => setCurrentDraft(null)} model="gemini">
          <p className="m-0">{aiDraft.chiefComplaint}</p>
          <p className="m-0 mt-2">{aiDraft.observations}</p>
          <p className="m-0 mt-2">{aiDraft.plan}</p>
        </AiNote>
      ) : current && !readonly ? (
        <div className="mt-5">
          <Button variant="outline" disabled={draftBusy} onClick={() => void generateDraft()}>
            {draftBusy ? t("common.loading") : t("record.generateDraft")}
          </Button>
        </div>
      ) : null}

      {versions.length > 0 ? (
        <details className="mt-6 border-t border-rule pt-4">
          <summary className="font-mono text-2xs text-ink-faint cursor-pointer">{t("record.versions")} ({versions.length})</summary>
          <ul className="list-none m-0 p-0 mt-3">
            {versions.map((v) => (
              <li key={v.id} className="py-2 border-b border-rule text-2xs text-ink-soft flex justify-between">
                <span>v{v.version} · {v.authorName}{v.changeReason ? ` · ${v.changeReason}` : ""}</span>
                <span className="font-mono">{formatDateTime(v.createdAt, "en-CH")}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <ConfirmDialog
        open={amendOpen}
        onClose={() => setAmendOpen(false)}
        onConfirm={() => void amend()}
        title={t("record.amend")}
        body={t("record.amendReason")}
        confirmLabel={t("record.amend")}
      />
      {amendOpen ? (
        <div className="mt-3">
          <Input label={t("record.amendReason")} value={amendReason} onChange={(e) => setAmendReason(e.target.value)} />
        </div>
      ) : null}
    </Modal>
  );
};

// ---------------------------------------------------------------- problems

const ProblemsTab = ({ patientId, t }: { patientId: string; t: T }) => {
  const { toast } = useToast();
  const { can } = useSession();
  const [problems, setProblems] = useState<Problem[] | null>(null);
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [display, setDisplay] = useState("");

  const load = useCallback(() => {
    api.problems(patientId).then((r) => setProblems(r.items)).catch(() => setProblems([]));
  }, [patientId]);
  useEffect(load, [load]);

  const add = async () => {
    try {
      await api.addProblem({ patientId, codingSystem: "ICD_10", code, display });
      setOpen(false);
      setCode(""); setDisplay("");
      load();
    } catch (err) {
      toast(err instanceof ApiProblem ? err.message : t("common.error"), "danger");
    }
  };

  return (
    <div>
      {can("clinical:write") ? (
        <div className="mb-4 flex justify-end">
          <Button variant="outline" onClick={() => setOpen(true)}>{t("record.addProblem")}</Button>
        </div>
      ) : null}
      {problems === null ? (
        <p aria-busy="true" className="font-mono text-2xs text-ink-faint">{t("common.loading")}…</p>
      ) : problems.length === 0 ? (
        <EmptyState title={t("record.activeProblems")} body={t("record.noEncountersBody")} />
      ) : (
        <DataTable<Problem>
          caption={t("record.problems")}
          rows={problems}
          columns={[
            { key: "code", header: "Code", render: (p) => <span className="font-mono text-2xs">{p.codingSystem === "ICD_10" ? "ICD-10" : p.codingSystem} {p.code}</span> },
            { key: "display", header: t("common.name"), render: (p) => <strong className="text-ink">{p.display}</strong> },
            { key: "status", header: t("common.status"), render: (p) => <StateLabel tone={p.status === "ACTIVE" ? "good" : "neutral"}>{p.status}</StateLabel> },
            {
              key: "actions",
              header: "",
              width: "120px",
              render: (p) =>
                p.status === "ACTIVE" && can("clinical:write") ? (
                  <button type="button" className="font-mono text-2xs text-moss hover:underline"
                    onClick={() => void api.setProblemStatus(p.id, "RESOLVED").then(load).catch(() => toast(t("common.error"), "danger"))}>
                    resolve
                  </button>
                ) : null,
            },
          ]}
        />
      )}
      <Modal open={open} onClose={() => setOpen(false)} kicker={t("record.addProblem").toUpperCase()} title={t("record.addProblem")}
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>{t("common.cancel")}</Button><Button variant="action" disabled={!code || !display} onClick={() => void add()}>{t("common.create")}</Button></>}>
        <Input label="ICD-10 code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="I10" />
        <Input label={t("common.name")} value={display} onChange={(e) => setDisplay(e.target.value)} />
      </Modal>
    </div>
  );
};

// ---------------------------------------------------------------- medication

const MedicationTab = ({ patientId, t }: { patientId: string; t: T }) => {
  const { toast } = useToast();
  const { can } = useSession();
  const [meds, setMeds] = useState<MedicationOrder[] | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [dose, setDose] = useState("");
  const [frequency, setFrequency] = useState("");

  const load = useCallback(() => {
    api.medications(patientId).then((r) => setMeds(r.items)).catch(() => setMeds([]));
  }, [patientId]);
  useEffect(load, [load]);

  const add = async () => {
    try {
      // Orders created here are DRAFT; activation requires explicit review.
      const created = await api.addMedication({ patientId, medicationName: name, dose: dose || undefined, frequency: frequency || undefined });
      await api.setMedicationStatus(created.id, "ACTIVE");
      setOpen(false); setName(""); setDose(""); setFrequency("");
      load();
    } catch (err) {
      toast(err instanceof ApiProblem ? err.message : t("common.error"), "danger");
    }
  };

  return (
    <div>
      {can("clinical:write") ? (
        <div className="mb-4 flex justify-end">
          <Button variant="outline" onClick={() => setOpen(true)}>{t("record.addMedication")}</Button>
        </div>
      ) : null}
      {meds === null ? (
        <p aria-busy="true" className="font-mono text-2xs text-ink-faint">{t("common.loading")}…</p>
      ) : meds.length === 0 ? (
        <EmptyState title={t("record.activeMedication")} body={t("record.noEncountersBody")} />
      ) : (
        <DataTable<MedicationOrder>
          caption={t("record.medications")}
          rows={meds}
          columns={[
            { key: "name", header: t("common.name"), render: (m) => <strong className="text-ink">{m.medicationName}</strong> },
            { key: "dose", header: "Dose", render: (m) => [m.dose, m.frequency].filter(Boolean).join(" · ") || "—" },
            { key: "status", header: t("common.status"), render: (m) => <StateLabel tone={m.status === "ACTIVE" ? "good" : "neutral"}>{m.status}</StateLabel> },
            {
              key: "actions",
              header: "",
              width: "120px",
              render: (m) =>
                m.status === "ACTIVE" && can("clinical:write") ? (
                  <button type="button" className="font-mono text-2xs text-moss hover:underline"
                    onClick={() => void api.setMedicationStatus(m.id, "COMPLETED").then(load).catch(() => toast(t("common.error"), "danger"))}>
                    complete
                  </button>
                ) : null,
            },
          ]}
        />
      )}
      <Modal open={open} onClose={() => setOpen(false)} kicker={t("record.addMedication").toUpperCase()} title={t("record.addMedication")}
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>{t("common.cancel")}</Button><Button variant="action" disabled={!name} onClick={() => void add()}>{t("common.create")}</Button></>}>
        <Input label={t("common.name")} value={name} onChange={(e) => setName(e.target.value)} />
        <div className="grid grid-cols-2 gap-5">
          <Input label="Dose" value={dose} onChange={(e) => setDose(e.target.value)} placeholder="5 mg" />
          <Input label="Frequency" value={frequency} onChange={(e) => setFrequency(e.target.value)} placeholder="once daily" />
        </div>
      </Modal>
    </div>
  );
};

// ---------------------------------------------------------------- allergies

const AllergiesTab = ({ patientId, t }: { patientId: string; t: T }) => {
  const { toast } = useToast();
  const { can } = useSession();
  const [allergies, setAllergies] = useState<Allergy[] | null>(null);
  const [open, setOpen] = useState(false);
  const [substance, setSubstance] = useState("");
  const [reaction, setReaction] = useState("");
  const [severity, setSeverity] = useState<string>("MILD");

  const load = useCallback(() => {
    api.allergies(patientId).then((r) => setAllergies(r.items)).catch(() => setAllergies([]));
  }, [patientId]);
  useEffect(load, [load]);

  const add = async () => {
    try {
      await api.addAllergy({ patientId, substance, reaction: reaction || undefined, severity, status: "ACTIVE" });
      setOpen(false); setSubstance(""); setReaction("");
      load();
    } catch (err) {
      toast(err instanceof ApiProblem ? err.message : t("common.error"), "danger");
    }
  };

  return (
    <div>
      {can("clinical:write") ? (
        <div className="mb-4 flex justify-end">
          <Button variant="outline" onClick={() => setOpen(true)}>{t("record.addAllergy")}</Button>
        </div>
      ) : null}
      {allergies === null ? (
        <p aria-busy="true" className="font-mono text-2xs text-ink-faint">{t("common.loading")}…</p>
      ) : allergies.length === 0 ? (
        <EmptyState title={t("record.noKnownAllergies")} body={t("record.noEncountersBody")} />
      ) : (
        <DataTable<Allergy>
          caption={t("record.allergies")}
          rows={allergies}
          columns={[
            { key: "substance", header: t("common.name"), render: (a) => <strong className={`text-ink ${a.severity === "SEVERE" ? "text-signal" : ""}`}>{a.substance}</strong> },
            { key: "reaction", header: "Reaction", render: (a) => a.reaction ?? "—" },
            { key: "severity", header: "Severity", render: (a) => <StateLabel tone={a.severity === "SEVERE" ? "alert" : "neutral"}>{a.severity ?? "—"}</StateLabel> },
            { key: "status", header: t("common.status"), render: (a) => <StateLabel tone={a.status === "ACTIVE" ? "good" : "neutral"}>{a.status}</StateLabel> },
          ]}
        />
      )}
      <Modal open={open} onClose={() => setOpen(false)} kicker={t("record.addAllergy").toUpperCase()} title={t("record.addAllergy")}
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>{t("common.cancel")}</Button><Button variant="action" disabled={!substance} onClick={() => void add()}>{t("common.create")}</Button></>}>
        <Input label={t("common.name")} value={substance} onChange={(e) => setSubstance(e.target.value)} placeholder="Penicillin" />
        <Input label="Reaction" value={reaction} onChange={(e) => setReaction(e.target.value)} placeholder="Rash" />
        <Select label="Severity" value={severity} onChange={(e) => setSeverity(e.target.value)}>
          {["MILD", "MODERATE", "SEVERE"].map((s) => <option key={s} value={s}>{s.toLowerCase()}</option>)}
        </Select>
      </Modal>
    </div>
  );
};

// ---------------------------------------------------------------- results

const ResultsTab = ({ patientId, t, locale }: { patientId: string; t: T; locale: string }) => {
  const [observations, setObservations] = useState<Observation[] | null>(null);
  const { can } = useSession();
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const [vitals, setVitals] = useState({ pulse: "", temp: "", bpS: "", bpD: "", weight: "" });

  useEffect(() => {
    api.observations(patientId).then((r) => setObservations(r.items)).catch(() => setObservations([]));
  }, [patientId]);

  const recordVitals = async () => {
    const entries: [string, string, string, string][] = [
      ["PULSE", vitals.pulse, "bpm", "8867-4"],
      ["TEMPERATURE", vitals.temp, "C", "8310-5"],
      ["BP_SYSTOLIC", vitals.bpS, "mmHg", "8480-6"],
      ["BP_DIASTOLIC", vitals.bpD, "mmHg", "8462-4"],
      ["WEIGHT", vitals.weight, "kg", "29463-7"],
    ];
    try {
      for (const [type, value, unit, loinc] of entries) {
        if (value.trim()) {
          await api.addObservation({ patientId, type, value: value.trim(), unit, loincCode: loinc });
        }
      }
      setOpen(false);
      setVitals({ pulse: "", temp: "", bpS: "", bpD: "", weight: "" });
      api.observations(patientId).then((r) => setObservations(r.items));
      toast(t("common.saved"), "success");
    } catch (err) {
      toast(err instanceof ApiProblem ? err.message : t("common.error"), "danger");
    }
  };

  return (
    <div>
      {can("clinical:write") ? (
        <div className="mb-4 flex justify-end">
          <Button variant="outline" onClick={() => setOpen(true)}>{t("record.addVitals")}</Button>
        </div>
      ) : null}
      {observations === null ? (
        <p aria-busy="true" className="font-mono text-2xs text-ink-faint">{t("common.loading")}…</p>
      ) : observations.length === 0 ? (
        <EmptyState title={t("record.results")} body={t("record.noEncountersBody")} />
      ) : (
        <DataTable<Observation>
          caption={t("record.results")}
          rows={observations}
          columns={[
            { key: "date", header: t("common.date"), render: (o) => <span className="font-mono text-2xs">{formatDateTime(o.effectiveAt, locale)}</span> },
            { key: "type", header: t("common.name"), render: (o) => <strong className="text-ink">{o.type.replace(/_/g, " ").toLowerCase()}</strong> },
            { key: "value", header: "Value", render: (o) => `${o.value}${o.unit ? ` ${o.unit}` : ""}` },
            { key: "loinc", header: "LOINC", render: (o) => <span className="font-mono text-2xs text-ink-faint">{o.loincCode ?? "—"}</span> },
          ]}
        />
      )}
      <Modal open={open} onClose={() => setOpen(false)} kicker={t("record.addVitals").toUpperCase()} title={t("record.addVitals")}
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>{t("common.cancel")}</Button><Button variant="action" onClick={() => void recordVitals()}>{t("common.save")}</Button></>}>
        <div className="grid grid-cols-3 gap-5 max-sm:grid-cols-2">
          <Input label="Pulse (bpm)" value={vitals.pulse} onChange={(e) => setVitals({ ...vitals, pulse: e.target.value })} inputMode="numeric" />
          <Input label="Temp (C)" value={vitals.temp} onChange={(e) => setVitals({ ...vitals, temp: e.target.value })} inputMode="decimal" />
          <Input label="BP systolic" value={vitals.bpS} onChange={(e) => setVitals({ ...vitals, bpS: e.target.value })} inputMode="numeric" />
          <Input label="BP diastolic" value={vitals.bpD} onChange={(e) => setVitals({ ...vitals, bpD: e.target.value })} inputMode="numeric" />
          <Input label="Weight (kg)" value={vitals.weight} onChange={(e) => setVitals({ ...vitals, weight: e.target.value })} inputMode="decimal" />
        </div>
      </Modal>
    </div>
  );
};

// ---------------------------------------------------------------- audit

const AuditTab = ({ patientId, t, locale }: { patientId: string; t: T; locale: string }) => {
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  useEffect(() => {
    api.auditEvents({ subjectPatientId: patientId, limit: 50 }).then((r) => setEvents(r.items)).catch(() => setEvents([]));
  }, [patientId]);
  if (!events) return <p aria-busy="true" className="font-mono text-2xs text-ink-faint">{t("common.loading")}…</p>;
  return (
    <DataTable<AuditEvent>
      caption={t("record.audit")}
      rows={events}
      columns={[
        { key: "date", header: t("common.date"), render: (e) => <span className="font-mono text-2xs">{formatDateTime(e.createdAt, locale)}</span> },
        { key: "action", header: t("audit.action"), render: (e) => <span className="font-mono text-2xs text-ink">{e.action}</span> },
        { key: "actor", header: t("audit.actor"), render: (e) => e.actorName ?? e.actorId ?? "system" },
        { key: "cat", header: t("audit.category"), render: (e) => <span className="font-mono text-2xs text-ink-faint">{e.category}</span> },
      ]}
    />
  );
};
