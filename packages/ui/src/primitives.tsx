/**
 * Editorial UI primitives. Every component ships visible focus states,
 * keyboard operability and text/icon state indicators (never color alone).
 */
import { type ReactNode, type ButtonHTMLAttributes } from "react";

// ---------------------------------------------------------------- Button

type ButtonVariant = "action" | "outline" | "ghost" | "danger" | "quiet";
type ButtonSize = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  arrow?: boolean;
}

const VARIANTS: Record<ButtonVariant, string> = {
  action:
    "bg-ink text-white hover:bg-navy border border-ink focus-visible:outline-focus",
  outline:
    "bg-transparent text-ink-soft border border-rule hover:border-ink hover:text-ink focus-visible:outline-focus",
  ghost:
    "bg-transparent text-ink-soft border border-transparent hover:bg-paper-deep hover:text-ink focus-visible:outline-focus",
  danger:
    "bg-signal text-white border border-signal hover:opacity-90 focus-visible:outline-focus",
  quiet:
    "bg-transparent text-ink-soft underline decoration-navy underline-offset-4 hover:text-navy focus-visible:outline-focus",
};

export const Button = ({
  variant = "outline",
  size = "md",
  arrow,
  className = "",
  children,
  ...rest
}: ButtonProps) => (
  <button
    type="button"
    className={`inline-flex items-center gap-3 font-sans tracking-[0.02em] transition-colors disabled:opacity-50 disabled:pointer-events-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-1 focus-visible:outline-offset-2 ${
      size === "sm" ? "text-xs px-2.5 py-1.5" : "text-xs px-4 py-2.5"
    } ${VARIANTS[variant]} ${className}`}
    {...rest}
  >
    {children}
    {arrow ? <span aria-hidden="true" className="text-moss">↗</span> : null}
  </button>
);

// ---------------------------------------------------------------- Kicker

export const Kicker = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <p className={`font-mono text-2xs tracking-[0.08em] text-ink-faint uppercase m-0 ${className}`}>
    {children}
  </p>
);

// ---------------------------------------------------------- SectionHeading

export const SectionHeading = ({
  title,
  aside,
  id,
}: {
  title: string;
  aside?: ReactNode;
  id?: string;
}) => (
  <div className="flex items-baseline justify-between border-b-2 border-ink pb-3">
    <h2 id={id} className="font-serif text-xl font-normal m-0 text-ink">
      {title}
    </h2>
    {aside ? <span className="font-mono text-2xs text-ink-soft">{aside}</span> : null}
  </div>
);

// --------------------------------------------------------------- StateLabel

export type StateTone = "draft" | "review" | "signed" | "amended" | "good" | "alert" | "neutral";

const TONE_TEXT: Record<StateTone, string> = {
  draft: "text-amber",
  review: "text-amber",
  signed: "text-moss",
  amended: "text-navy",
  good: "text-moss",
  alert: "text-signal",
  neutral: "text-ink-soft",
};

export const StateLabel = ({
  tone = "neutral",
  children,
  title,
}: {
  tone?: StateTone;
  children: ReactNode;
  title?: string;
}) => (
  <span
    title={title}
    className={`inline-block font-mono text-2xs uppercase px-1.5 py-0.5 border border-current ${TONE_TEXT[tone]}`}
  >
    {children}
  </span>
);

// ----------------------------------------------------------------- UnderLink

export const UnderLink = ({
  children,
  onClick,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`inline-flex items-baseline gap-4 text-xs text-navy border-b border-navy py-4 hover:text-ink hover:border-ink transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-1 ${className}`}
  >
    {children}
    <span aria-hidden="true" className="text-sm leading-none">→</span>
  </button>
);

// ----------------------------------------------------------------- Monogram

export const Monogram = ({ name, className = "" }: { name: string; className?: string }) => {
  const initials = name
    .split(/\s+/)
    .filter((w) => /[a-zA-Z]/.test(w[0] ?? ""))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (
    <span
      aria-hidden="true"
      className={`inline-grid place-items-center w-7 h-7 rounded-full bg-navy-tint text-navy font-sans font-semibold text-2xs ${className}`}
    >
      {initials || "·"}
    </span>
  );
};

// ----------------------------------------------------------- Spinner/Skeleton

export const Spinner = ({ label = "Loading" }: { label?: string }) => (
  <span role="status" aria-live="polite" className="inline-flex items-center gap-2 text-ink-faint text-xs font-mono">
    <span aria-hidden="true" className="animate-pulse">●</span>
    {label}
  </span>
);

export const Skeleton = ({ className = "" }: { className?: string }) => (
  <div aria-hidden="true" className={`bg-paper-deep animate-pulse ${className}`} />
);

// ------------------------------------------------------------------ Divider

export const Rule = ({ strong = false }: { strong?: boolean }) => (
  <hr className={`border-0 border-t ${strong ? "border-ink border-t-2" : "border-rule"} m-0`} />
);
