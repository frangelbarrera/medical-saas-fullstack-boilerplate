/**
 * Form controls: persistent labels, errors announced next to the field
 * (WCAG 2.2 AA), full keyboard operability.
 */
import { type InputHTMLAttributes, type TextareaHTMLAttributes, type SelectHTMLAttributes, type ReactNode, useId } from "react";

const baseInput =
  "w-full bg-transparent border-b border-ink py-1.5 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:border-navy focus:border-b-2 disabled:opacity-50";

export interface FieldProps {
  label: string;
  htmlFor?: string;
  error?: string | null;
  hint?: string;
  children: ReactNode;
  required?: boolean;
}

export const Field = ({ label, htmlFor, error, hint, children, required }: FieldProps) => (
  <div className="mb-4">
    <label htmlFor={htmlFor} className="block font-mono text-2xs uppercase tracking-[0.08em] text-ink-faint mb-1.5">
      {label}
      {required ? <span aria-hidden="true" className="text-signal"> *</span> : null}
    </label>
    {children}
    {hint && !error ? (
      <p className="mt-1 text-2xs text-ink-faint font-sans">{hint}</p>
    ) : null}
    {error ? (
      <p role="alert" className="mt-1 text-2xs text-signal font-sans">
        {error}
      </p>
    ) : null}
  </div>
);

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string | null;
  hint?: string;
}

export const Input = ({ label, error, hint, id, required, ...rest }: InputProps) => {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <Field label={label} htmlFor={fieldId} error={error} hint={hint} required={required}>
      <input id={fieldId} className={baseInput} aria-invalid={error ? true : undefined} {...rest} />
    </Field>
  );
};

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string | null;
  hint?: string;
}

export const Textarea = ({ label, error, hint, id, required, ...rest }: TextareaProps) => {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <Field label={label} htmlFor={fieldId} error={error} hint={hint} required={required}>
      <textarea id={fieldId} className={`${baseInput} resize-y min-h-20 border border-rule px-2 focus:border-navy`} aria-invalid={error ? true : undefined} {...rest} />
    </Field>
  );
};

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string | null;
  children: ReactNode;
}

export const Select = ({ label, error, id, children, required, ...rest }: SelectProps) => {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <Field label={label} htmlFor={fieldId} error={error} required={required}>
      <select id={fieldId} className={`${baseInput} border border-rule px-2 py-1.5 bg-white focus:border-navy`} {...rest}>
        {children}
      </select>
    </Field>
  );
};
