/**
 * Intl adapters (I18N-001): dates, times and money always go through
 * Intl with the user's locale and the clinic timezone. Nothing is
 * hard-coded.
 */
import type { Locale } from "@medical/contracts";

export const formatDate = (iso: string | null | undefined, locale: string): string => {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));
};

export const formatDateLong = (iso: string | null | undefined, locale: string): string => {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(
    new Date(iso),
  );
};

export const formatTime = (iso: string | null | undefined, locale: string, timeZone?: string): string => {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", ...(timeZone ? { timeZone } : {}) }).format(
    new Date(iso),
  );
};

export const formatDateTime = (iso: string | null | undefined, locale: string, timeZone?: string): string => {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(iso));
};

export const formatMoney = (amount: number | null | undefined, currency: string, locale: string): string => {
  if (amount === null || amount === undefined) return "—";
  return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
};

export const formatPercent = (ratio: number | null | undefined, locale: string): string => {
  if (ratio === null || ratio === undefined) return "—";
  return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 }).format(ratio);
};

/** "today" headline in the clinic timezone, e.g. WEDNESDAY · 1 OCTOBER 2026 */
export const formatEditionDate = (date: Date, locale: string, timeZone?: string): string => {
  const fmt = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    ...(timeZone ? { timeZone } : {}),
  });
  return fmt.format(date).toUpperCase();
};

export const localeFor = (locale: string): string => (locale in { "en-CH": 1, "de-CH": 1, "fr-CH": 1, "it-CH": 1 } ? locale : "en-CH");

export const localeDisplayName = (locale: Locale): string =>
  ({ "en-CH": "EN", "de-CH": "DE", "fr-CH": "FR", "it-CH": "IT" })[locale];
