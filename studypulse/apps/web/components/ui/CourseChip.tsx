// A course's identifying tint with its code as text (never the color alone). The colors
// come from the vetted palette via CSS variables, so they switch with the theme.
import { courseColorFor } from "@studypulse/tokens";

import styles from "./ui.module.css";

export function courseVars(colorHex: string | null | undefined) {
  const key = courseColorFor(colorHex).key;
  return {
    stripe: `var(--sp-course-${key}-stripe)`,
    chip: `var(--sp-course-${key}-chip)`,
    onChip: `var(--sp-course-${key}-on-chip)`,
  };
}

export function CourseChip({
  code,
  colorHex,
  title,
}: {
  code: string;
  colorHex?: string | null;
  title?: string;
}) {
  const v = courseVars(colorHex);
  return (
    <span
      className={styles.courseChip}
      style={{ background: v.chip, color: v.onChip }}
      title={title}
    >
      {code}
    </span>
  );
}
