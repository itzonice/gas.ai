// Labeled form fields. The label is always a real <label>; placeholders are only
// examples. Hints and errors are tied to the control with aria-describedby.
import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

import { Icon } from "./icons";
import styles from "./ui.module.css";

interface FieldProps {
  label: string;
  hint?: string;
  error?: string | null;
}

function useField({ hint, error }: Omit<FieldProps, "label">, id: string | undefined) {
  const generated = useId();
  const inputId = id ?? generated;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  return {
    inputId,
    hintId,
    errorId,
    controlProps: {
      id: inputId,
      "aria-invalid": error ? true : undefined,
      "aria-describedby": [hintId, errorId].filter(Boolean).join(" ") || undefined,
    },
  };
}

function FieldFrame({
  label,
  hint,
  error,
  inputId,
  hintId,
  errorId,
  children,
}: FieldProps & {
  inputId: string;
  hintId: string | undefined;
  errorId: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className={styles.field}>
      <label htmlFor={inputId} className={styles.fieldLabel}>
        {label}
      </label>
      {children}
      {hint ? (
        <span id={hintId} className={styles.fieldHint}>
          {hint}
        </span>
      ) : null}
      {error ? (
        <span id={errorId} className={styles.fieldError}>
          <Icon name="warning" size={16} />
          {error}
        </span>
      ) : null}
    </div>
  );
}

export function TextField({
  label,
  hint,
  error,
  id,
  ...props
}: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  const f = useField({ hint, error }, id);
  return (
    <FieldFrame label={label} hint={hint} error={error} {...f}>
      <input className={styles.fieldInput} {...f.controlProps} {...props} />
    </FieldFrame>
  );
}

export function TextArea({
  label,
  hint,
  error,
  id,
  ...props
}: FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const f = useField({ hint, error }, id);
  return (
    <FieldFrame label={label} hint={hint} error={error} {...f}>
      <textarea
        className={`${styles.fieldInput} ${styles.fieldTextArea}`}
        {...f.controlProps}
        {...props}
      />
    </FieldFrame>
  );
}

export function SelectField({
  label,
  hint,
  error,
  id,
  children,
  ...props
}: FieldProps & SelectHTMLAttributes<HTMLSelectElement>) {
  const f = useField({ hint, error }, id);
  return (
    <FieldFrame label={label} hint={hint} error={error} {...f}>
      <select className={styles.fieldInput} {...f.controlProps} {...props}>
        {children}
      </select>
    </FieldFrame>
  );
}
