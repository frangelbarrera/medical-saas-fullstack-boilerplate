/**
 * Overlay components: modal and drawer with keyboard support (Escape closes,
 * focus is moved into the dialog and restored on close).
 */
import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "./primitives.js";

const useDialogBehaviour = (open: boolean, onClose: () => void) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const focusables = () =>
      Array.from(
        node?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
    focusables()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const items = focusables();
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [open, onClose]);
  return ref;
};

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  kicker?: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}

export const Modal = ({ open, onClose, title, kicker, children, footer, wide }: ModalProps) => {
  const ref = useDialogBehaviour(open, onClose);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`bg-white border border-ink max-h-[88vh] overflow-auto ${wide ? "w-full max-w-3xl" : "w-full max-w-lg"}`}
      >
        <header className="px-6 pt-5 pb-4 border-b border-rule">
          {kicker ? (
            <p className="font-mono text-2xs uppercase tracking-[0.08em] text-ink-faint m-0 mb-1.5">{kicker}</p>
          ) : null}
          <h2 className="font-serif text-lg m-0 text-ink">{title}</h2>
        </header>
        <div className="px-6 py-5">{children}</div>
        {footer ? (
          <footer className="px-6 py-4 border-t border-rule flex justify-end gap-2">{footer}</footer>
        ) : null}
      </div>
    </div>
  );
};

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export const Drawer = ({ open, onClose, title, children }: DrawerProps) => {
  const ref = useDialogBehaviour(open, onClose);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/30" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className="bg-white border-l border-ink w-full max-w-md h-full overflow-auto">
        <header className="px-6 pt-5 pb-4 border-b border-rule flex items-center justify-between">
          <h2 className="font-serif text-lg m-0 text-ink">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close panel" className="text-ink-soft hover:text-ink text-lg focus-visible:outline focus-visible:outline-2">
            ✕
          </button>
        </header>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
};

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  body: string;
  confirmLabel?: string;
  danger?: boolean;
}

export const ConfirmDialog = ({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel = "Confirm",
  danger,
}: ConfirmDialogProps) => (
  <Modal
    open={open}
    onClose={onClose}
    title={title}
    footer={
      <>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button
          variant={danger ? "danger" : "action"}
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          {confirmLabel}
        </Button>
      </>
    }
  >
    <p className="text-sm text-ink-soft m-0">{body}</p>
  </Modal>
);
