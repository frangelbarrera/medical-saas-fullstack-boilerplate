/**
 * Login: editorial card on paper. Generic error message (no user
 * enumeration), language switch available pre-auth.
 */
import { useState } from "react";
import { LOCALES, type Locale } from "@medical/contracts";
import { api, ApiProblem } from "../lib/api.js";
import { useI18n } from "../i18n/index.js";
import { useSession } from "../auth/index.js";
import { Button, Input, Banner } from "@medical/ui";
import { localeDisplayName } from "../lib/format.js";

export const LoginView = () => {
  const { t, locale, setLocale } = useI18n();
  const { refresh } = useSession();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.login(username.trim(), password);
      await refresh();
    } catch (err) {
      if (err instanceof ApiProblem) setError(err.code === "INVALID_CREDENTIALS" ? t("login.invalid") : err.message);
      else setError(t("login.invalid"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center px-4" style={{ background: "var(--color-paper)" }}>
      <main className="w-full max-w-sm">
        <div className="mb-8">
          <span aria-hidden="true" className="block w-10 h-[3px] bg-moss mb-5" />
          <p className="font-mono text-2xs tracking-[0.08em] text-ink-faint uppercase m-0 mb-3">RIVERMARK · {t("app.tagline")}</p>
          <h1 className="font-serif text-3xl m-0 text-ink">{t("login.title")}</h1>
          <p className="text-sm text-ink-soft mt-3 mb-0">{t("login.lede")}</p>
        </div>

        {error ? <div className="mb-4"><Banner tone="danger">{error}</Banner></div> : null}

        <form onSubmit={submit} noValidate>
          <Input
            label={t("login.username")}
            value={username}
            autoComplete="username"
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          <Input
            label={t("login.password")}
            type="password"
            value={password}
            autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <Button variant="action" type="submit" disabled={busy || !username || !password} className="w-full justify-center mt-2">
            {t("login.submit")}
          </Button>
        </form>

        <p className="mt-8 font-mono text-2xs text-ink-faint flex items-center gap-2 m-0">
          <span aria-hidden="true">·</span> {t("login.secureNote")}
        </p>

        <div role="group" aria-label={t("lang.switch")} className="flex gap-1.5 mt-4">
          {LOCALES.map((l: Locale) => (
            <button
              key={l}
              type="button"
              onClick={() => setLocale(l)}
              aria-pressed={locale === l}
              className={`px-2 py-1 font-mono text-2xs border transition-colors ${
                locale === l ? "border-ink text-ink" : "border-transparent text-ink-faint hover:text-ink"
              }`}
            >
              {localeDisplayName(l)}
            </button>
          ))}
        </div>
      </main>
    </div>
  );
};
