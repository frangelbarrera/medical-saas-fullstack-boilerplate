/**
 * Insights: aggregate metrics only. Numbers as editorial statements, one
 * mini bar chart, no per-patient data.
 */
import { useEffect, useState } from "react";
import type { BillingSummary, DaybookOverview } from "@medical/contracts";
import { api } from "../lib/api.js";
import { useSession } from "../auth/index.js";
import { useI18n } from "../i18n/index.js";
import { formatMoney, formatPercent } from "../lib/format.js";
import { Kicker, Skeleton, StateLabel } from "@medical/ui";

export const InsightsView = () => {
  const { t, locale } = useI18n();
  const { profile } = useSession();
  const [daybook, setDaybook] = useState<DaybookOverview | null>(null);
  const [billing, setBilling] = useState<BillingSummary | null>(null);
  const currency = profile?.clinic.currency ?? "CHF";

  useEffect(() => {
    void api.daybook().then(setDaybook).catch(() => setDaybook(null));
    void api.billingSummary().then(setBilling).catch(() => setBilling(null));
  }, []);

  const pulse = daybook?.clinicPulse;

  return (
    <section aria-label={t("insights.title")}>
      <div className="mb-8">
        <Kicker>AGGREGATE / 30 DAYS</Kicker>
        <h1 className="font-serif text-3xl m-0 text-ink mt-2">
          {t("insights.title")}<span className="text-moss">.</span>
        </h1>
        <p className="text-sm text-ink-soft mt-3 mb-0">{t("insights.lede")}</p>
      </div>

      {!pulse || !billing ? (
        <div className="space-y-5" aria-busy="true">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : (
        <div className="border-t-2 border-ink">
          <div className="grid grid-cols-[1fr_230px] gap-8 py-6 border-b border-rule max-md:grid-cols-1">
            <div>
              <Kicker>{t("insights.volume").toUpperCase()}</Kicker>
              <strong className="block font-serif text-lg mt-1.5 text-ink">
                {pulse.totalAppointments30d} {t("daybook.appointments")}
              </strong>
              <p className="text-xs text-ink-soft mt-1.5 mb-0 flex gap-4">
                <span>{formatPercent(pulse.onTimeRate, locale)} {t("daybook.onTime")}</span>
              </p>
            </div>
            <div aria-hidden="true" className="h-10 flex items-end gap-1.5 border-b border-rule self-end">
              {[42, 56, 48, 68, 57, 82, 74, 64, 71, 88, 79, 91].map((h, i) => (
                <i key={i} className={`block w-[13px] ${i === 11 ? "bg-moss" : "bg-[#abc4b8]"}`} style={{ height: `${h}%` }} />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 py-6 border-b border-rule max-md:grid-cols-1 max-md:gap-6">
            <div>
              <Kicker>{t("billing.invoiced30").toUpperCase()}</Kicker>
              <strong className="block font-serif text-lg mt-1.5 text-ink">{formatMoney(billing.invoiced30d, currency, locale)}</strong>
            </div>
            <div>
              <Kicker>{t("billing.collected30").toUpperCase()}</Kicker>
              <strong className="block font-serif text-lg mt-1.5 text-moss">{formatMoney(billing.collected30d, currency, locale)}</strong>
            </div>
            <div>
              <Kicker>{t("billing.outstanding").toUpperCase()}</Kicker>
              <strong className="block font-serif text-lg mt-1.5 text-ink">
                {formatMoney(billing.outstanding, currency, locale)}
                {billing.overdueCount > 0 ? (
                  <span className="ml-3 align-middle"><StateLabel tone="alert">{billing.overdueCount} {t("billing.overdue")}</StateLabel></span>
                ) : null}
              </strong>
            </div>
          </div>

          <div className="py-6">
            <Kicker>{t("billing.expenses30").toUpperCase()}</Kicker>
            <strong className="block font-serif text-lg mt-1.5 text-ink">{formatMoney(billing.expenses30d, currency, locale)}</strong>
            <p className="text-xs text-ink-soft mt-1.5 mb-0">{t("daybook.last30")}</p>
          </div>
        </div>
      )}
    </section>
  );
};
