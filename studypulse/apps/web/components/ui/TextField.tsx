// A labeled text input. The label is always a real <label>; placeholders are only
// examples. Hints and errors are tied to the input with aria-describedby.
import { useId, type InputHTMLAttributes } from "react";

import { Icon } from "./icons";
import styles from "./ui.module.css";

export function TextField({
  label,
  hint,
  error,
  id,
  ...props
}: {
  label: string;
  hint?: string;
  error?: string | null;
} & InputHTMLAttributes<HTMLInputElement>) {
  const generated = useId();
  const inputId = id ?? generated;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={styles.field}>
      <label htmlFor={inputId} className={styles.fieldLabel}>
        {label}
      </label>
      <input
        id={inputId}
        className={styles.fieldInput}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...props}
      />
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
