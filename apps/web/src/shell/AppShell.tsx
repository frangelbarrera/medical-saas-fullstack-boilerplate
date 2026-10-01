/**
 * Application shell: editorial rail navigation (numbered), masthead with
 * breadcrumbs + search trigger + language, and the main workspace. The rail
 * items derive from the route table + capabilities; a capability-missing
 * item is simply not rendered (one workspace, not one page per role).
 */
import { useEffect, useState, type ReactNode } from "react";
import { LOCALES, type Locale, type Capability } from "@medical/contracts";
import { ROUTES, navigate } from "../routes.js";
import { useSession } from "../auth/index.js";
import { useI18n } from "../i18n/index.js";
import { localeDisplayName } from "../lib/format.js";
import { Monogram } from "@medical/ui";
import { CommandPalette } from "./CommandPalette.js";

const NAV_ORDER: { id: string; capability?: Capability; labelKey: "nav.daybook" | "nav.agenda" | "nav.patients" | "nav.messages" | "nav.billing" | "nav.insights" | "nav.audit" | "nav.admin" }[] = [
  { id: "daybook", labelKey: "nav.daybook" },
  { id: "agenda", labelKey: "nav.agenda", capability: "schedule:read" },
  { id: "patients", labelKey: "nav.patients", capability: "patients:read" },
  { id: "messages", labelKey: "nav.messages", capability: "messages:read" },
  { id: "billing", labelKey: "nav.billing", capability: "billing:read" },
  { id: "insights", labelKey: "nav.insights", capability: "insights:read" },
  { id: "audit", labelKey: "nav.audit", capability: "audit:read" },
];

const ADMIN_ITEM = { id: "admin", labelKey: "nav.admin", capability: "admin:clinic" } as const;

export const AppShell = ({
  children,
  activeNav,
}: {
  children: ReactNode;
  activeNav: string;
}) => {
  const { profile, can, logout } = useSession();
  const { t, locale, setLocale } = useI18n();
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const navItems = NAV_ORDER.filter((i) => !i.capability || can(i.capability as Capability));
  const showAdmin = can(ADMIN_ITEM.capability as Capability);
  const activeTitle = ROUTES.find((r) => r.navId === activeNav)?.titleKey ?? "nav.daybook";

  const go = (id: string) => {
    const route = ROUTES.find((r) => r.navId === id);
    if (route) navigate(route.pattern);
  };

  return (
    <div className="flex min-h-screen">
      <a href="#main-content" className="skip-link">{t("shell.skipToContent")}</a>

      <aside aria-label={t("shell.primaryNav")} className="fixed inset-y-0 left-0 w-[210px] bg-navy text-[#dfe8e6] flex flex-col px-5 pt-7 pb-5 z-40">
        <div className="px-2.5 pb-12">
          <span aria-hidden="true" className="block w-7 h-[3px] bg-[#b8d4c6] mb-4" />
          <strong className="block text-sm tracking-[0.12em] text-white font-semibold">RIVERMARK</strong>
          <small className="block mt-1.5 font-mono text-2xs tracking-[0.04em] text-[#93abb0]">
            {t("app.tagline").toUpperCase()}
          </small>
        </div>

        <nav aria-label={t("shell.primaryNav")} className="flex flex-col gap-0.5">
          {navItems.map((item, idx) => {
            const active = item.id === activeNav;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => go(item.id)}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 w-full text-left text-xs px-2.5 py-2.5 border-l-2 transition-colors ${
                  active
                    ? "text-white border-[#b8d4c6] bg-white/[0.08]"
                    : "text-[#b9cccd] border-transparent hover:text-white hover:bg-white/[0.055]"
                }`}
              >
                <span className={`font-mono text-2xs w-5 ${active ? "text-[#b8d4c6]" : "text-[#79979c]"}`}>
                  {String(idx + 1).padStart(2, "0")}
                </span>
                {t(item.labelKey)}
              </button>
            );
          })}
        </nav>

        <div className="mt-auto">
          {showAdmin ? (
            <button
              type="button"
              onClick={() => go(ADMIN_ITEM.id)}
              aria-current={ADMIN_ITEM.id === activeNav ? "page" : undefined}
              className={`flex items-center gap-3 w-full text-left text-xs px-2.5 py-2.5 mb-6 border-l-2 transition-colors ${
                ADMIN_ITEM.id === activeNav
                  ? "text-white border-[#b8d4c6] bg-white/[0.08]"
                  : "text-[#b9cccd] border-transparent hover:text-white"
              }`}
            >
              <span className="font-mono text-2xs w-5 text-[#79979c]">
                {String(navItems.length + 1).padStart(2, "0")}
              </span>
              {t(ADMIN_ITEM.labelKey)}
            </button>
          ) : null}

          <div className="border-t border-white/15 pt-4 flex items-center gap-2 text-2xs text-[#8ea8ab]">
            <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-[#b8d4c6]" />
            <span>{t("shell.secureSession")}</span>
            <button
              type="button"
              onClick={() => navigate("/settings")}
              aria-label={t("nav.settings")}
              className="ml-auto"
            >
              <Monogram name={profile?.fullName ?? ""} className="!bg-[#c7d9cf] !text-navy" />
            </button>
          </div>
        </div>
      </aside>

      <div className="ml-[210px] w-[calc(100%-210px)] min-h-screen flex flex-col">
        <header className="h-[68px] border-b border-rule flex items-center justify-between px-8 md:px-13 sticky top-0 bg-paper z-30">
          <div className="flex items-center gap-3 text-xs text-ink-soft">
            <span>{profile?.clinic.name ?? ""}</span>
            <span aria-hidden="true" className="text-ink-faint">/</span>
            <strong className="text-ink font-medium">{t(activeTitle as "nav.daybook")}</strong>
          </div>
          <div className="flex items-center gap-5">
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="text-xs text-ink-soft hover:text-ink focus-visible:outline focus-visible:outline-2"
            >
              {t("shell.search")} <kbd className="ml-2 px-1.5 py-1 bg-paper-deep font-mono text-2xs">⌘ K</kbd>
            </button>
            <div role="group" aria-label={t("lang.switch")} className="flex gap-1">
              {LOCALES.map((l: Locale) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLocale(l)}
                  aria-pressed={locale === l}
                  className={`px-1.5 py-0.5 font-mono text-2xs border transition-colors ${
                    locale === l ? "border-ink text-ink" : "border-transparent text-ink-faint hover:text-ink"
                  }`}
                >
                  {localeDisplayName(l)}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => void logout()}
              className="text-xs text-ink-soft hover:text-signal focus-visible:outline focus-visible:outline-2"
            >
              {t("shell.signOut")}
            </button>
          </div>
        </header>

        <main id="main-content" tabIndex={-1} className="flex-1 px-7 pt-12 pb-16 md:px-15 max-w-[1320px] w-full mx-auto">
          {children}
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
};
