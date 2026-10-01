/**
 * Command palette (UX-003): server-side patient search, debounced, opens the
 * record directly. Keyboard-first (arrow keys + Enter).
 */
import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api.js";
import { navigate } from "../routes.js";
import { useI18n } from "../i18n/index.js";
import type { SearchHit } from "@medical/contracts";

export const CommandPalette = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [selected, setSelected] = useState(0);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setHits([]);
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setHits([]);
      return;
    }
    setBusy(true);
    const timer = setTimeout(() => {
      api
        .search(trimmed)
        .then((r) => {
          setHits(r.items);
          setSelected(0);
        })
        .catch(() => setHits([]))
        .finally(() => setBusy(false));
    }, 220);
    return () => clearTimeout(timer);
  }, [query, open]);

  if (!open) return null;

  const openHit = (hit: SearchHit) => {
    onClose();
    navigate(hit.href);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-ink/40 flex items-start justify-center pt-24 px-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div role="dialog" aria-modal="true" aria-label={t("shell.search")} className="bg-white border border-ink w-full max-w-xl">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setSelected((s) => Math.min(s + 1, hits.length - 1));
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setSelected((s) => Math.max(s - 1, 0));
            }
            if (e.key === "Enter" && hits[selected]) openHit(hits[selected]);
          }}
          placeholder={t("palette.placeholder")}
          aria-label={t("palette.placeholder")}
          className="w-full border-0 border-b border-rule px-5 py-4 text-sm font-sans bg-transparent focus:outline-none"
        />
        <div className="max-h-72 overflow-auto">
          {busy ? <p className="px-5 py-4 font-mono text-2xs text-ink-faint">{t("common.loading")}…</p> : null}
          {!busy && query.trim().length >= 2 && hits.length === 0 ? (
            <p className="px-5 py-4 text-sm text-ink-soft">{t("palette.noResults")}</p>
          ) : null}
          {hits.map((hit, idx) => (
            <button
              key={hit.id}
              type="button"
              onMouseEnter={() => setSelected(idx)}
              onClick={() => openHit(hit)}
              className={`w-full text-left px-5 py-3 flex items-baseline gap-4 ${
                idx === selected ? "bg-paper-deep" : ""
              }`}
            >
              <span className="font-mono text-2xs text-ink-faint w-6">{String(idx + 1).padStart(2, "0")}</span>
              <span className="flex-1">
                <span className="block text-sm text-ink font-medium">{hit.title}</span>
                {hit.subtitle ? <span className="block font-mono text-2xs text-ink-faint mt-0.5">{hit.subtitle}</span> : null}
              </span>
              <span aria-hidden="true" className="text-moss">↗</span>
            </button>
          ))}
        </div>
        <p className="border-t border-rule px-5 py-2.5 font-mono text-2xs text-ink-faint m-0">{t("palette.hint")}</p>
      </div>
    </div>
  );
};
