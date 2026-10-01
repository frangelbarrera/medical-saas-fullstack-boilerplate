/**
 * Locale registry (I18N-001).
 *
 * The product ships with the four Swiss national languages from day one.
 * Formatting goes through Intl adapters (see apps/web/src/i18n/format.ts);
 * nothing hardcodes date or number formats.
 */

export const LOCALES = ["en-CH", "de-CH", "fr-CH", "it-CH"] as const;

export type Locale = (typeof LOCALES)[number];

export interface LocaleMeta {
  readonly code: Locale;
  readonly language: string; // UI language code for Intl
  readonly displayName: string;
}

export const LOCALE_META: Record<Locale, LocaleMeta> = {
  "en-CH": { code: "en-CH", language: "en", displayName: "English" },
  "de-CH": { code: "de-CH", language: "de", displayName: "Deutsch" },
  "fr-CH": { code: "fr-CH", language: "fr", displayName: "Français" },
  "it-CH": { code: "it-CH", language: "it", displayName: "Italiano" },
};

export const DEFAULT_LOCALE: Locale = "en-CH";

export const isLocale = (value: unknown): value is Locale =>
  typeof value === "string" && (LOCALES as readonly string[]).includes(value);

/** ISO-4217 currencies supported by clinic settings. */
export const CURRENCIES = ["CHF", "EUR", "USD"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const TIMEZONES = [
  "Europe/Zurich",
  "Europe/London",
  "UTC",
] as const;

export const isTimezone = (value: unknown): value is (typeof TIMEZONES)[number] =>
  typeof value === "string" && (TIMEZONES as readonly string[]).includes(value);
