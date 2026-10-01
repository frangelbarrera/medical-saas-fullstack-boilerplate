/**
 * Daybook (Overview): editorial edition header, status line, asymmetric
 * grid - today's agenda column (58%) and review queue (42%), clinic
 * activity footer. Numbers live in the status line, not in KPI cards.
 */
import { useEffect, useState } from "react";
import type { DaybookOverview } from "@medical/contracts";
import { api } from "../lib/api.js";
import { useSession } from "../auth/index.js";
import { useI18n } from "../i18n/index.js";
import { formatEditionDate, formatPercent, formatTime } from "../lib/format.js";
import { Button, EmptyState, Kicker, SectionHeading, Skeleton, StateLabel, UnderLink } from "@medical/ui";
import { navigate } from "../routes.js";

const APPOINTMENT_TAG: Record<string, string> = {
  NEW_PATIENT: "New patient",
  FOLLOW_UP: "Follow-up",
  ANNUAL_CHECKUP: "Annual check-up",
  PROCEDURE: "Procedure",
  OTHER: "Consultation",
};

export const DaybookView = () => {
  const { t, locale } = useI18n();
  const { profile } = useSession();
  const [data, setData] = useState<DaybookOverview | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api.daybook().then(setData).catch(() => setFailed(true));
  }, []);

  if (failed) {
    return <EmptyState title={t("common.error")} body={t("common.error")} action={<Button onClick={() => location.reload()}>{t("common.retry")}</Button>} />;
  }
  if (!data) {
    return (
      <div className="space-y-8" aria-busy="true">
        <Skeleton className="h-24 w-3/4" />
        <Skeleton className="h-10 w-full" />
        <div className="grid grid-cols-[1.55fr_0.82fr] gap-16 max-md:grid-cols-1">
          <Skeleton className="h-96" />
          <Skeleton className="h-72" />
        </div>
      </div>
    );
  }

  const tz = profile?.clinic.timezone;
  const now = new Date();

  return (
    <section aria-label={t("daybook.title")}>
      <div className="flex items-end justify-between mb-8 max-md:flex-col max-md:items-start max-md:gap-5">
        <div>
          <Kicker>{formatEditionDate(now, locale, tz)}</Kicker>
          <h1 className="font-serif text-3xl font-normal m-0 text-ink mt-2">
            {t("daybook.title")}<span className="text-moss">.</span>
          </h1>
          <p className="text-sm text-ink-soft mt-3 mb-0">{t("daybook.lede")}</p>
        </div>
        <Button variant="action" arrow onClick={() => navigate("/agenda")}>
          {t("daybook.newAppointment")}
        </Button>
      </div>

      <div className="border-y border-ink border-b-rule flex flex-wrap items-center gap-7 py-3 font-mono text-2xs text-ink-soft mb-9 [&>span]:flex [&>span]:items-center [&>span]:gap-1.5">
        <span><b className="text-ink font-medium">{data.appointmentsToday}</b> {t("daybook.appointments")}</span>
        <span><b className="text-ink font-medium">{String(data.waitingNow).padStart(2, "0")}</b> {t("daybook.waiting")}</span>
        <span className="text-signal"><b className="font-medium">{String(data.resultsToReview).padStart(2, "0")}</b> {t("daybook.resultsToReview")}</span>
        <span className="ml-auto flex items-center gap-1.5 text-moss">
          <i aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-moss inline-block" />
          {t("daybook.secureWorkspace")}
        </span>
      </div>

      <div className="grid grid-cols-[minmax(0,1.55fr)_minmax(280px,0.82fr)] gap-16 max-lg:grid-cols-1 max-lg:gap-10">
        <section aria-label={t("daybook.today")}>
          <SectionHeading title={t("daybook.today")} aside={`${t("daybook.localTime")} · ${tz ?? "UTC"}`} />
          {data.today.length === 0 ? (
            <div className="pt-6">
              <EmptyState title={t("daybook.emptyToday")} body={t("daybook.emptyTodayBody")} />
            </div>
          ) : (
            <ol className="list-none m-0 p-0">
              {data.today.map((appt) => {
                const past = new Date(appt.endTime) < now;
                const live = new Date(appt.startTime) <= now && new Date(appt.endTime) > now;
                return (
                  <li
                    key={appt.id}
                    className={`grid grid-cols-[52px_1px_1fr_auto] gap-4 items-center min-h-[72px] border-b border-rule ${past ? "opacity-70" : ""}`}
                  >
                    <time className="font-mono text-xs text-ink-soft">{formatTime(appt.startTime, locale, tz)}</time>
                    <span aria-hidden="true" className={`h-8 ${live ? "w-[3px] bg-moss" : "w-px bg-rule"}`} />
                    <button
                      type="button"
                      onClick={() => navigate(`/patients/${appt.patientId}/record`)}
                      className="text-left focus-visible:outline focus-visible:outline-2 group"
                    >
                      <span className="flex gap-3.5 items-baseline">
                        <strong className="text-sm font-semibold text-ink group-hover:text-navy">{appt.patientName}</strong>
                        <span className="font-mono text-2xs text-ink-faint uppercase">{APPOINTMENT_TAG[appt.type] ?? appt.type}</span>
                      </span>
                      <span className="block text-xs text-ink-soft mt-1">
                        {appt.reason ?? "—"} <span aria-hidden="true" className="text-ink-faint mx-1">·</span>
                        {appt.room ? `Room ${appt.room}` : appt.doctorName}
                      </span>
                    </button>
                    <StateLabel tone={appt.status === "COMPLETED" ? "good" : appt.status === "IN_PROGRESS" ? "alert" : "neutral"}>
                      {t(`agenda.status.${appt.status}` as "agenda.status.SCHEDULED")}
                    </StateLabel>
                  </li>
                );
              })}
            </ol>
          )}
          <UnderLink onClick={() => navigate("/agenda")}>{t("daybook.viewAgenda")}</UnderLink>
        </section>

        <aside aria-label={t("daybook.toReview")} className="border-l border-rule pl-8 max-lg:border-l-0 max-lg:pl-0 max-lg:border-t max-lg:pt-6">
          <SectionHeading title={t("daybook.toReview")} aside={`${String(data.toReview.length).padStart(2, "0")} ${t("daybook.openItems")}`} />
          <ul className="list-none m-0 p-0">
            {data.toReview.length === 0 ? (
              <li className="py-6 text-sm text-ink-soft">{t("daybook.emptyTodayBody")}</li>
            ) : (
              data.toReview.map((item, idx) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => navigate(item.href)}
                    className={`w-full text-left grid grid-cols-[28px_1fr_16px] gap-2.5 items-start border-b border-rule py-4 focus-visible:outline focus-visible:outline-2 ${
                      item.critical ? "text-signal" : ""
                    }`}
                  >
                    <span className="font-mono text-2xs text-ink-faint">{String(idx + 1).padStart(2, "0")}</span>
                    <span>
                      <strong className={`block text-sm font-semibold ${item.critical ? "text-signal" : "text-ink"}`}>{item.title}</strong>
                      <span className="block text-xs text-ink-soft mt-1">{item.detail}</span>
                      <small className="block font-mono text-2xs text-ink-faint mt-1">{item.dueLabel}</small>
                    </span>
                    <span aria-hidden="true" className="text-moss">↗</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </aside>
      </div>

      <footer className="border-t-2 border-ink mt-14 pt-4 grid grid-cols-[1fr_230px] gap-8 items-end max-md:grid-cols-1">
        <div>
          <Kicker>{t("daybook.clinicActivity").toUpperCase()}</Kicker>
          <strong className="block font-serif text-lg mt-1.5 text-ink">
            {formatPercent(data.clinicPulse.onTimeRate, locale)} {t("daybook.onTime")}
          </strong>
          <p className="text-xs text-ink-soft mt-1.5 mb-0">
            {t("daybook.last30")} · {data.clinicPulse.totalAppointments30d} {t("daybook.appointments")}
          </p>
        </div>
        <div aria-hidden="true" className="h-10 flex items-end gap-1.5 border-b border-rule">
          {[42, 56, 48, 68, 57, 82, 74, 91].map((h, i) => (
            <i key={i} className={`block w-[15px] ${i === 7 ? "bg-moss" : "bg-[#abc4b8]"}`} style={{ height: `${h}%` }} />
          ))}
        </div>
      </footer>
    </section>
  );
};
