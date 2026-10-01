/**
 * Agenda: day view as an editorial timetable (time / practitioner columns),
 * week overview strip, appointment modal with overlap feedback, status
 * changes and quick record access.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Appointment } from "@medical/contracts";
import { api, ApiProblem } from "../lib/api.js";
import { useSession } from "../auth/index.js";
import { useI18n } from "../i18n/index.js";
import { formatEditionDate, formatTime } from "../lib/format.js";
import { Button, Field, Input, Kicker, Modal, Select, Textarea, StateLabel, useToast, Banner, EmptyState } from "@medical/ui";
import { navigate } from "../routes.js";
import { useSession as useAuth } from "../auth/index.js";

const TYPES = ["NEW_PATIENT", "FOLLOW_UP", "ANNUAL_CHECKUP", "PROCEDURE", "OTHER"] as const;
const STATUSES = ["SCHEDULED", "CONFIRMED", "CHECKED_IN", "IN_PROGRESS", "COMPLETED", "NO_SHOW", "CANCELLED"] as const;

const dayStart = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const isoLocal = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:00`;

export const AgendaView = () => {
  const { t, locale } = useI18n();
  const { profile } = useAuth();
  const { can } = useSession();
  const [date, setDate] = useState(new Date());
  const [mode, setMode] = useState<"day" | "week">("day");
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [doctors, setDoctors] = useState<{ id: string; fullName: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Appointment | null>(null);

  const tz = profile?.clinic.timezone;

  const load = useCallback(async () => {
    setLoading(true);
    const from = mode === "day" ? dayStart(date) : dayStart(addDays(date, -((date.getDay() + 6) % 7)));
    const to = mode === "day" ? addDays(dayStart(date), 1) : addDays(from, 7);
    try {
      const [appts, docs] = await Promise.all([
        api.appointments(from.toISOString(), to.toISOString()),
        api.doctors(),
      ]);
      setAppointments(appts.items);
      setDoctors(docs.items);
    } finally {
      setLoading(false);
    }
  }, [date, mode]);

  useEffect(() => {
    void load();
  }, [load]);

  const doctorColumns = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of appointments) map.set(a.doctorId, a.doctorName);
    for (const d of doctors) if (!map.has(d.id)) map.set(d.id, d.fullName);
    return Array.from(map.entries());
  }, [appointments, doctors]);

  const openNew = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (appt: Appointment) => {
    if (!can("schedule:write")) return;
    setEditing(appt);
    setModalOpen(true);
  };


  const weekDays = useMemo(() => {
    const start = addDays(dayStart(date), -((date.getDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [date]);

  return (
    <section aria-label={t("agenda.title")}>
      <div className="flex items-end justify-between mb-8 max-md:flex-col max-md:items-start max-md:gap-5">
        <div>
          <Kicker>{formatEditionDate(date, locale, tz)}</Kicker>
          <h1 className="font-serif text-3xl m-0 text-ink mt-2">
            {t("agenda.title")}<span className="text-moss">.</span>
          </h1>
          <p className="text-sm text-ink-soft mt-3 mb-0">{t("agenda.lede")}</p>
        </div>
        {can("schedule:write") ? (
          <Button variant="action" arrow onClick={openNew}>{t("agenda.newAppointment")}</Button>
        ) : null}
      </div>

      <div className="flex items-center gap-4 border-t-2 border-ink border-b border-rule py-3 mb-6 font-mono text-2xs overflow-x-auto whitespace-nowrap">
        <div role="tablist" aria-label={t("agenda.title")} className="flex gap-px">
          <button type="button" role="tab" aria-selected={mode === "day"} onClick={() => setMode("day")}
            className={`px-2.5 py-1.5 border transition-colors ${mode === "day" ? "border-ink text-ink" : "border-transparent text-ink-soft hover:text-ink"}`}>
            {t("agenda.day")}
          </button>
          <button type="button" role="tab" aria-selected={mode === "week"} onClick={() => setMode("week")}
            className={`px-2.5 py-1.5 border transition-colors ${mode === "week" ? "border-ink text-ink" : "border-transparent text-ink-soft hover:text-ink"}`}>
            {t("agenda.week")}
          </button>
        </div>
        <button type="button" aria-label="Previous" onClick={() => setDate(mode === "day" ? addDays(date, -1) : addDays(date, -7))}
          className="text-ink-soft hover:text-ink px-1">‹</button>
        <strong className="text-ink font-medium">{mode === "day" ? formatEditionDate(date, locale, tz) : `${weekDays[0].toLocaleDateString(locale)} – ${weekDays[6].toLocaleDateString(locale)}`}</strong>
        <button type="button" aria-label="Next" onClick={() => setDate(mode === "day" ? addDays(date, 1) : addDays(date, 7))}
          className="text-ink-soft hover:text-ink px-1">›</button>
        <button type="button" onClick={() => setDate(new Date())} className="text-ink-soft hover:text-ink underline underline-offset-4">↺</button>
        <span className="flex-1" />
      </div>

      {loading ? (
        <p className="font-mono text-2xs text-ink-faint" aria-busy="true">{t("common.loading")}…</p>
      ) : mode === "day" ? (
        doctorColumns.length === 0 ? (
          <EmptyState title={t("daybook.emptyToday")} body={t("daybook.emptyTodayBody")} />
        ) : (
          <div className="border-t-2 border-ink min-w-[620px] overflow-x-auto">
            <div className="grid" style={{ gridTemplateColumns: `72px repeat(${doctorColumns.length}, 1fr)` }}>
              <div className="py-3.5 font-mono text-2xs text-ink-faint border-b border-rule">{t("common.time").toUpperCase()}</div>
              {doctorColumns.map(([id, name]) => (
                <div key={id} className="py-3.5 px-5 font-mono text-2xs text-ink border-b border-rule border-l">
                  {name.toUpperCase()}
                </div>
              ))}
              {Array.from({ length: 12 }, (_, i) => i + 8).map((hour) => {
                const slotAppts = appointments.filter((a) => new Date(a.startTime).getHours() === hour);
                return (
                  <div key={hour} className="contents">
                    <div className="py-4 font-mono text-2xs text-ink-faint border-b border-rule">{String(hour).padStart(2, "0")}:00</div>
                    {doctorColumns.map(([id]) => {
                      const appt = slotAppts.find((a) => a.doctorId === id);
                      if (!appt) return <div key={id} className="border-b border-rule border-l min-h-16" />;
                      const isLive = new Date(appt.startTime) <= new Date() && new Date(appt.endTime) > new Date();
                      return (
                        <div key={id} className="border-b border-rule border-l p-2">
                          <button
                            type="button"
                            onClick={() => openEdit(appt)}
                            className={`w-full text-left px-3 py-2.5 text-xs transition-colors ${
                              isLive ? "bg-moss-tint text-navy-deep border-l-[3px] border-l-moss" : "bg-paper-deep text-ink-soft hover:bg-navy-tint"
                            }`}
                          >
                            <span className="block font-medium text-ink">{appt.patientName}</span>
                            <span className="block font-mono text-2xs mt-1 opacity-80">
                              {formatTime(appt.startTime, locale, tz)} · {APPOINTMENT_TAG[appt.type]}
                            </span>
                            <span className="block mt-1"><StateLabel tone={appt.status === "COMPLETED" ? "good" : appt.status === "CANCELLED" ? "alert" : "neutral"}>{t(`agenda.status.${appt.status}` as "agenda.status.SCHEDULED")}</StateLabel></span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        )
      ) : (
        <div className="grid grid-cols-7 gap-3 max-md:grid-cols-2">
          {weekDays.map((day) => {
            const dayAppts = appointments.filter((a) => dayStart(new Date(a.startTime)).getTime() === day.getTime());
            return (
              <div key={day.toISOString()} className="border border-rule bg-white/50 min-h-32">
                <p className="m-0 px-2.5 py-2 border-b border-rule font-mono text-2xs text-ink-soft">
                  {day.toLocaleDateString(locale, { weekday: "short", day: "numeric" })}
                </p>
                <ul className="list-none m-0 p-0">
                  {dayAppts.map((a) => (
                    <li key={a.id} className="px-2.5 py-1.5 border-b border-rule last:border-0">
                      <button type="button" onClick={() => openEdit(a)} className="text-left w-full">
                        <span className="font-mono text-2xs text-ink-faint">{formatTime(a.startTime, locale, tz)}</span>
                        <span className="block text-2xs text-ink mt-0.5">{a.patientName}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      <AppointmentModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        editing={editing}
        doctors={doctors}
        defaultDate={date}
        onSaved={async () => {
          setModalOpen(false);
          await load();
        }}
      />
    </section>
  );
};

const APPOINTMENT_TAG: Record<string, string> = {
  NEW_PATIENT: "New",
  FOLLOW_UP: "Follow-up",
  ANNUAL_CHECKUP: "Check-up",
  PROCEDURE: "Procedure",
  OTHER: "Consult",
};

const AppointmentModal = ({
  open,
  onClose,
  editing,
  doctors,
  defaultDate,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  editing: Appointment | null;
  doctors: { id: string; fullName: string }[];
  defaultDate: Date;
  onSaved: () => Promise<void>;
}) => {
  const { t } = useI18n();
  const { toast } = useToast();
  const { can } = useAuth();
  const [patientQuery, setPatientQuery] = useState("");
  const [patientResults, setPatientResults] = useState<{ id: string; fullName: string; internalRef: string }[]>([]);
  const [patientId, setPatientId] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [type, setType] = useState<string>("FOLLOW_UP");
  const [startTime, setStartTime] = useState(isoLocal(defaultDate));
  const [duration, setDuration] = useState(30);
  const [reason, setReason] = useState("");
  const [room, setRoom] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPatientId(editing?.patientId ?? "");
    setPatientQuery(editing?.patientName ?? "");
    setDoctorId(editing?.doctorId ?? doctors[0]?.id ?? "");
    setType(editing?.type ?? "FOLLOW_UP");
    setStartTime(editing ? isoLocal(new Date(editing.startTime)) : `${isoLocal(defaultDate).slice(0, 11)}09:00`);
    setDuration(editing ? Math.round((new Date(editing.endTime).getTime() - new Date(editing.startTime).getTime()) / 60000) : 30);
    setReason(editing?.reason ?? "");
    setRoom(editing?.room ?? "");
    setNotes(editing?.notes ?? "");
    setError(null);
  }, [open, editing, doctors, defaultDate]);

  useEffect(() => {
    if (!open || patientId) return;
    const q = patientQuery.trim();
    if (q.length < 2) {
      setPatientResults([]);
      return;
    }
    const timer = setTimeout(() => {
      api.patients({ q, limit: 6 }).then((r) => setPatientResults(r.items)).catch(() => setPatientResults([]));
    }, 220);
    return () => clearTimeout(timer);
  }, [patientQuery, open, patientId]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const payload = {
      patientId,
      doctorId,
      type,
      startTime: new Date(startTime).toISOString(),
      durationMinutes: duration,
      reason: reason || undefined,
      room: room || undefined,
      notes: notes || undefined,
    };
    try {
      if (editing) {
        await api.updateAppointment(editing.id, payload);
      } else {
        await api.createAppointment(payload);
      }
      toast(t("common.saved"), "success");
      await onSaved();
    } catch (err) {
      if (err instanceof ApiProblem) {
        setError(err.code === "OVERLAPPING_APPOINTMENT" ? t("agenda.overlap") : err.message);
      } else setError(t("common.error"));
    } finally {
      setBusy(false);
    }
  };

  const statusButtons = editing && can("schedule:write") ? (
    <div className="flex flex-wrap gap-1.5 mb-4">
      {STATUSES.map((s) => (
        <button key={s} type="button" onClick={() => void api.setAppointmentStatus(editing.id, s).then(() => { toast(t("common.saved"), "success"); void onSaved(); }).catch((e) => toast(e instanceof ApiProblem ? e.message : t("common.error"), "danger"))}
          className={`px-2 py-1 font-mono text-2xs border transition-colors ${editing.status === s ? "border-ink text-ink" : "border-rule text-ink-faint hover:border-ink hover:text-ink"}`}>
          {t(`agenda.status.${s}` as "agenda.status.SCHEDULED")}
        </button>
      ))}
    </div>
  ) : null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      kicker={editing ? `APPOINTMENT / ${editing.patientInternalRef}` : t("agenda.newAppointment").toUpperCase()}
      title={editing ? editing.patientName : t("agenda.newAppointment")}
      wide
      footer={
        <>
          {editing ? (
            <Button variant="quiet" onClick={() => { onClose(); navigate(`/patients/${editing.patientId}/record`); }}>
              {t("agenda.openRecord")} →
            </Button>
          ) : null}
          <Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant="action" disabled={busy || !patientId || !doctorId} onClick={() => void submit()}>
            {editing ? t("common.save") : t("common.create")}
          </Button>
        </>
      }
    >
      {statusButtons}
      {error ? <div className="mb-4"><Banner tone="warning">{error}</Banner></div> : null}
      <div className="grid grid-cols-2 gap-5 max-sm:grid-cols-1">
        <div className="col-span-2">
          <Field label={t("agenda.patient")} htmlFor="appt-patient">
            {patientId ? (
              <div className="flex items-baseline justify-between border-b border-ink py-1.5">
                <span className="text-sm">{patientQuery}</span>
                {editing ? null : (
                  <button type="button" className="font-mono text-2xs text-ink-faint hover:text-signal" onClick={() => { setPatientId(""); setPatientQuery(""); }}>change</button>
                )}
              </div>
            ) : (
              <>
                <input
                  id="appt-patient"
                  className="w-full bg-transparent border-b border-ink py-1.5 text-sm focus:outline-none"
                  value={patientQuery}
                  onChange={(e) => setPatientQuery(e.target.value)}
                  placeholder={t("patients.searchPlaceholder")}
                  autoComplete="off"
                />
                {patientResults.length > 0 ? (
                  <ul className="list-none m-0 p-0 mt-1 border border-rule">
                    {patientResults.map((p) => (
                      <li key={p.id}>
                        <button type="button" onClick={() => { setPatientId(p.id); setPatientQuery(p.fullName); setPatientResults([]); }}
                          className="w-full text-left px-3 py-2 hover:bg-paper-deep text-sm">
                          {p.fullName} <span className="font-mono text-2xs text-ink-faint ml-2">{p.internalRef}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            )}
          </Field>
        </div>
        <Select label={t("agenda.doctor")} value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
          {doctors.map((d) => <option key={d.id} value={d.id}>{d.fullName}</option>)}
        </Select>
        <Select label={t("agenda.type")} value={type} onChange={(e) => setType(e.target.value)}>
          {TYPES.map((ty) => <option key={ty} value={ty}>{t(`agenda.status.SCHEDULED`) && ty.replace(/_/g, " ").toLowerCase()}</option>)}
        </Select>
        <Input label={t("common.date")} type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        <Input label={t("agenda.duration")} type="number" min={5} max={480} step={5} value={duration}
          onChange={(e) => setDuration(Number(e.target.value))} />
        <Input label={`${t("agenda.room")} (${t("common.optional")})`} value={room} onChange={(e) => setRoom(e.target.value)} />
        <Input label={`${t("common.reason")} (${t("common.optional")})`} value={reason} onChange={(e) => setReason(e.target.value)} />
        <div className="col-span-2">
          <Textarea label={`${t("common.notes")} (${t("common.optional")})`} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
};
