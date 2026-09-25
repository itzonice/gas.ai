"use client";

// Side sheet for editing one parsed item. A modal <dialog>: focus moves in and is
// trapped, Escape closes, and focus returns to the row that opened it. Edits apply as
// they are typed; "Looks right" confirms the item.
import { ASSIGNMENT_KINDS, type ReviewCategory, type ReviewItem } from "@studypulse/core/syllabus";
import { useEffect, useRef } from "react";

import { Button, Icon, SelectField, TextField } from "@/components/ui";

import { KIND_LABELS } from "./labels";
import styles from "./syllabus.module.css";

export function ReviewDrawer({
  item,
  categories,
  errors,
  onChange,
  onConfirm,
  onToggleExcluded,
  onClose,
}: {
  item: ReviewItem | null;
  categories: readonly ReviewCategory[];
  errors: Partial<Record<string, string>>;
  onChange: (patch: Partial<ReviewItem>) => void;
  onConfirm: () => void;
  onToggleExcluded: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const open = item !== null;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={styles.drawer}
      aria-labelledby="drawer-title"
      onClose={onClose}
      onClick={(e) => {
        // A click on the backdrop (the dialog itself, outside the sheet) closes it.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {item ? (
        <div className={styles.drawerInner}>
          <div className={styles.drawerHeader}>
            <h2 id="drawer-title" className={styles.drawerTitle}>
              Edit {item.title.trim() || "item"}
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

          <div className={styles.drawerBody}>
            {item.reasons.length > 0 && !item.checked ? (
              <ul className={styles.reasons} aria-label="Why this needs review">
                {item.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            ) : null}

            <TextField
              label="Title"
              value={item.title}
              required
              error={errors.title ?? null}
              onChange={(e) => {
                onChange({ title: e.currentTarget.value });
              }}
            />
            <div className={styles.twoUp}>
              <SelectField
                label="Type"
                value={item.kind}
                onChange={(e) => {
                  onChange({ kind: e.currentTarget.value as ReviewItem["kind"] });
                }}
              >
                {ASSIGNMENT_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABELS[k]}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label="Grade category"
                value={item.category_name ?? ""}
                error={errors.category_name ?? null}
                onChange={(e) => {
                  onChange({ category_name: e.currentTarget.value || null });
                }}
              >
                <option value="">No category</option>
                {item.category_name && !categories.some((c) => c.name === item.category_name) ? (
                  <option value={item.category_name}>{item.category_name} (not in grading)</option>
                ) : null}
                {categories.map((c) => (
                  <option key={c.key} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </SelectField>
            </div>
            <div className={styles.twoUp}>
              <TextField
                label="Due date"
                type="date"
                value={item.due_date ?? ""}
                hint="Leave empty if there's no date yet."
                error={errors.due_at ?? null}
                onChange={(e) => {
                  onChange({ due_date: e.currentTarget.value || null });
                }}
              />
              <TextField
                label="Due time"
                type="time"
                value={item.due_time ?? ""}
                hint="Empty means 11:59 PM."
                disabled={!item.due_date}
                onChange={(e) => {
                  onChange({ due_time: e.currentTarget.value || null });
                }}
              />
            </div>
            <TextField
              label="Points"
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={item.points_possible ?? ""}
              hint="Optional. Used to weigh this item within its category."
              error={errors.points_possible ?? null}
              onChange={(e) => {
                const v = e.currentTarget.value;
                onChange({ points_possible: v === "" ? null : Number(v) });
              }}
            />

            {item.source_quote ? (
              <figure style={{ margin: 0, display: "grid", gap: "var(--sp-space-half)" }}>
                <figcaption className={styles.note}>From the syllabus</figcaption>
                <blockquote className={styles.quote}>{item.source_quote}</blockquote>
              </figure>
            ) : null}
          </div>

          <div className={styles.drawerFooter}>
            <Button
              variant="text"
              icon={item.excluded ? "add" : "delete"}
              onClick={onToggleExcluded}
            >
              {item.excluded ? "Add back to schedule" : "Leave out of schedule"}
            </Button>
            <Button variant="filled" icon="check" onClick={onConfirm}>
              Looks right
            </Button>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
