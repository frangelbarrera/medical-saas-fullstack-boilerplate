/**
 * i18n provider: four Swiss locales, persisted per user (localStorage key
 * medicalsaas.locale), Intl adapters consume the same value.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { Locale } from "@medical/contracts";
import { LOCALES, DEFAULT_LOCALE } from "@medical/contracts";
import { en, type Dictionary, type TranslationKey } from "./locales/en.js";
import { de } from "./locales/de.js";
import { fr } from "./locales/fr.js";
import { it } from "./locales/it.js";

const DICTIONARIES: Record<Locale, Dictionary> = { "en-CH": en, "de-CH": de, "fr-CH": fr, "it-CH": it };

const STORAGE_KEY = "medicalsaas.locale";

const readStoredLocale = (): Locale => {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    if (value && (LOCALES as readonly string[]).includes(value)) return value as Locale;
  } catch {
    // storage unavailable (private mode): fall through to default
  }
  return DEFAULT_LOCALE;
};

interface I18nValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey) => string;
}

const I18nContext = createContext<I18nValue>({
  locale: DEFAULT_LOCALE,
  setLocale: () => undefined,
  t: (k) => en[k],
});

export const I18nProvider = ({ children }: { children: ReactNode }) => {
  const [locale, setLocaleState] = useState<Locale>(readStoredLocale);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // best effort only
    }
    document.documentElement.lang = next;
  }, []);

  const t = useCallback((key: TranslationKey) => DICTIONARIES[locale][key] ?? en[key] ?? key, [locale]);

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useI18n = (): I18nValue => useContext(I18nContext);
