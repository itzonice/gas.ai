"use client";

// Modal dialog on the native <dialog>: focus moves in and is trapped, Escape closes, a
// click on the backdrop closes, and focus returns to whatever opened it. "side" is a
// sheet from the right (full screen on phones); "center" is a centered card.
import { useEffect, useRef, type ReactNode } from "react";

import { Icon } from "./icons";
import styles from "./ui.module.css";

export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  variant = "center",
  labelledBy = "dialog-title",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  variant?: "side" | "center";
  labelledBy?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      opener.current = document.activeElement as HTMLElement | null;
      dialog.showModal();
    }
    if (!open && dialog.open) {
      dialog.close();
    }
    if (!open && opener.current) {
      const target = opener.current;
      opener.current = null;
      // After React commits, in case the opener re-rendered.
      requestAnimationFrame(() => {
        if (target.isConnected) target.focus();
      });
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`${styles.dialog} ${variant === "side" ? styles.dialogSide : styles.dialogCenter}`}
      aria-labelledby={labelledBy}
      onClose={() => {
        if (open) onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {open ? (
        <div className={styles.dialogInner}>
          <div className={styles.dialogHeader}>
            <h2 id={labelledBy} className={styles.dialogTitle}>
              {title}
            </h2>
            <button
              type="button"
              className={styles.iconButton}
              aria-label="Close"
              onClick={onClose}
            >
              <Icon name="close" />
            </button>
          </div>
          <div className={styles.dialogBody}>{children}</div>
          {footer ? <div className={styles.dialogFooter}>{footer}</div> : null}
        </div>
      ) : null}
    </dialog>
  );
}
