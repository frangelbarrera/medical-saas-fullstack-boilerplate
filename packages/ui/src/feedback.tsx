/**
 * Feedback components: banners (with icon + text, never color alone), empty
 * states with human guidance, and the editorial toast host.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export type BannerTone = "info" | "success" | "warning" | "danger";

const BANNER_STYLES: Record<BannerTone, { border: string; text: string; icon: string; bg: string }> = {
  info: { border: "border-navy", text: "text-navy", icon: "ℹ", bg: "bg-navy-tint" },
  success: { border: "border-moss", text: "text-moss", icon: "✓", bg: "bg-moss-tint" },
  warning: { border: "border-amber", text: "text-amber", icon: "⚠", bg: "bg-amber-tint" },
  danger: { border: "border-signal", text: "text-signal", icon: "✕", bg: "bg-signal-tint" },
};

export const Banner = ({ tone = "info", children }: { tone?: BannerTone; children: ReactNode }) => {
  const s = BANNER_STYLES[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={`flex gap-3 items-start border ${s.border} ${s.bg} px-4 py-3`}>
      <span aria-hidden="true" className={`font-mono text-xs ${s.text}`}>{s.icon}</span>
      <div className={`text-sm ${s.text}`}>{children}</div>
    </div>
  );
};

export const EmptyState = ({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) => (
  <div className="border border-rule bg-white/60 px-8 py-14 text-center">
    <h3 className="font-serif text-lg m-0 text-ink">{title}</h3>
    <p className="text-sm text-ink-soft mt-2 mb-5 mx-auto max-w-md">{body}</p>
    {action}
  </div>
);

// ------------------------------------------------------------------ toasts

export interface ToastMessage {
  id: number;
  tone: BannerTone;
  text: string;
}

interface ToastContextValue {
  toast: (text: string, tone?: BannerTone) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => undefined });

export const useToast = (): ToastContextValue => useContext(ToastContext);

export const ToastHost = ({ children }: { children: ReactNode }) => {
  const [messages, setMessages] = useState<ToastMessage[]>([]);
  const toast = useCallback((text: string, tone: BannerTone = "info") => {
    const id = Date.now() + Math.random();
    setMessages((m) => [...m, { id, tone, text }]);
    setTimeout(() => setMessages((m) => m.filter((x) => x.id !== id)), 3600);
  }, []);
  const value = useMemo(() => ({ toast }), [toast]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="polite" className="fixed bottom-6 right-6 z-[60] flex flex-col gap-2">
        {messages.map((m) => {
          const s = BANNER_STYLES[m.tone];
          return (
            <div key={m.id} className={`flex gap-2 items-center bg-navy text-white text-xs px-4 py-3 border ${s.border} max-w-sm`}>
              <span aria-hidden="true" className="font-mono">{s.icon}</span>
              {m.text}
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};
