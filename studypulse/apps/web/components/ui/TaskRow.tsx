"use client";

// One task or assignment in a plain list (not a card per item). The row's link covers the
// title and metadata only; the checkbox and overflow menu are separate tap targets beside
// it, never nested inside the link.
import Link from "next/link";
import type { ReactNode } from "react";

import { courseVars, CourseChip } from "./CourseChip";
import { Icon } from "./icons";
import { OverflowMenu, type MenuItem } from "./OverflowMenu";
import styles from "./ui.module.css";

export interface TaskRowProps {
  id: string;
  title: string;
  href: string;
  course: { code: string; colorHex?: string | null };
  /** Human due text, e.g. "Due today at 5:00 PM". */
  dueText?: string;
  overdue?: boolean;
  /** Extra metadata, e.g. "Worth 20% · ~45 min". */
  meta?: ReactNode;
  done: boolean;
  onToggleDone: (done: boolean) => void;
  menuItems?: readonly MenuItem[];
}

export function TaskRow({
  id,
  title,
  href,
  course,
  dueText,
  overdue,
  meta,
  done,
  onToggleDone,
  menuItems,
}: TaskRowProps) {
  const checkboxId = `task-${id}-done`;
  return (
    <li
      className={[styles.taskRow, done ? styles.taskDone : ""].join(" ")}
      style={{ ["--stripe" as string]: courseVars(course.colorHex).stripe }}
    >
      <label className={styles.checkboxTarget} htmlFor={checkboxId}>
        <input
          id={checkboxId}
          type="checkbox"
          className={styles.checkbox}
          checked={done}
          onChange={(e) => {
            onToggleDone(e.currentTarget.checked);
          }}
        />
        <span className={styles.visuallyHidden}>
          {done ? `Mark ${title} not done` : `Mark ${title} done`}
        </span>
      </label>

      <Link href={href} className={styles.taskLink}>
        <span className={styles.taskTitle}>{title}</span>
        <span className={styles.taskMeta}>
          <CourseChip code={course.code} colorHex={course.colorHex} />
          {overdue ? (
            <span className={styles.statusError}>
              <Icon name="warning" size={16} />
              Overdue
            </span>
          ) : null}
          {dueText ? <span>{dueText}</span> : null}
          {meta ? <span>{meta}</span> : null}
        </span>
      </Link>

      {menuItems?.length ? (
        <OverflowMenu label={`More actions for ${title}`} items={menuItems} />
      ) : null}
    </li>
  );
}

/** A plain list of task rows with an accessible name. */
export function TaskList({ label, children }: { label: string; children: ReactNode }) {
  return (
    <ul className={styles.taskList} aria-label={label}>
      {children}
    </ul>
  );
}
