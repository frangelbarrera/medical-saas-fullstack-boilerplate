/**
 * Settings: own profile, password change, language preference.
 */
import { useState } from "react";
import { LOCALES, type Locale } from "@medical/contracts";
import { api, ApiProblem } from "../lib/api.js";
import { useSession } from "../auth/index.js";
import { useI18n } from "../i18n/index.js";
import { localeDisplayName } from "../lib/format.js";
import { Banner, Button, Input, Kicker } from "@medical/ui";

export const SettingsView = () => {
  const { t, locale, setLocale } = useI18n();
  const { profile } = useSession();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [changed, setChanged] = useState(false);

  const submit = async () => {
    setError(null);
    try {
      await api.changePassword(current, next);
      setChanged(true);
      setCurrent(""); setNext("");
    } catch (err) {
      setError(err instanceof ApiProblem ? err.message : t("common.error"));
    }
  };

  return (
    <section aria-label={t("settings.title")} className="max-w-lg">
      <div className="mb-8">
        <h1 className="font-serif text-3xl m-0 text-ink mt-2">
          {t("settings.title")}<span className="text-moss">.</span>
        </h1>
        <p className="text-sm text-ink-soft mt-3 mb-0">{t("settings.lede")}</p>
      </div>

      <div className="border-t-2 border-ink pt-6 pb-8">
        <Kicker>{t("settings.profile").toUpperCase()}</Kicker>
        <dl className="grid grid-cols-[160px_1fr] gap-4 mt-4 m-0">
          <dt className="font-mono text-2xs text-ink-faint uppercase">{t("common.name")}</dt>
          <dd className="m-0 text-sm text-ink">{profile?.fullName}</dd>
          <dt className="font-mono text-2xs text-ink-faint uppercase">{t("login.username")}</dt>
          <dd className="m-0 font-mono text-2xs">{profile?.username}</dd>
          <dt className="font-mono text-2xs text-ink-faint uppercase">{t("admin.role")}</dt>
          <dd className="m-0 text-sm text-ink">{profile ? t(`admin.role.${profile.role}` as "admin.role.ADMIN") : "—"}</dd>
          <dt className="font-mono text-2xs text-ink-faint uppercase">{t("admin.clinic")}</dt>
          <dd className="m-0 text-sm text-ink">{profile?.clinic.name}</dd>
        </dl>
      </div>

      <div className="border-t border-rule pt-6 pb-8">
        <Kicker>{t("settings.language").toUpperCase()}</Kicker>
        <div role="group" aria-label={t("settings.language")} className="flex gap-2 mt-4">
          {LOCALES.map((l: Locale) => (
            <button
              key={l}
              type="button"
              aria-pressed={locale === l}
              onClick={() => setLocale(l)}
              className={`px-3 py-2 font-mono text-2xs border transition-colors ${
                locale === l ? "border-ink text-ink bg-paper-deep" : "border-rule text-ink-soft hover:border-ink"
              }`}
            >
              {localeDisplayName(l)} · {l}
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-rule pt-6">
        <Kicker>{t("settings.security").toUpperCase()}</Kicker>
        {changed ? <div className="mt-4"><Banner tone="warning">{t("settings.passwordChanged")}</Banner></div> : null}
        {error ? <div className="mt-4"><Banner tone="danger">{error}</Banner></div> : null}
        <div className="mt-4">
          <Input label={t("settings.currentPassword")} type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          <Input label={t("settings.newPassword")} type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} hint={t("settings.passwordHint")} />
          <Button variant="action" disabled={!current || next.length < 12} onClick={() => void submit()}>
            {t("settings.changePassword")}
          </Button>
        </div>
      </div>
    </section>
  );
};
