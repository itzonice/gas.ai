// Pure wording and export for the Stats screen. The numbers (minutes, grades, the
// average) come from get_stats_overview; this only describes them.
import type { StatsOverview } from "@studypulse/core/api";

import { formatMinutes } from "@/components/today/model";

export type StatsCourse = StatsOverview["courses"][number];

export const PERIOD_OPTIONS = [4, 8, 12] as const;

export function courseLabel(c: Pick<StatsCourse, "code" | "name">): string {
  return c.code ?? c.name;
}

/** 84.5 -> "84.5%", 90 -> "90%". */
export function percent(value: number): string {
  return `${Number(value.toFixed(1)).toString()}%`;
}

/** Hours with one decimal: 95 -> "1.6 h". */
export function hours(minutes: number): string {
  return `${(Math.round(minutes / 6) / 10).toString()} h`;
}

/** Share of the widest bar, 0..100, with a sliver for any nonzero value so it shows. */
export function barWidth(value: number, max: number): number {
  if (value <= 0 || max <= 0) return 0;
  return Math.max(2, Math.min(100, (value / max) * 100));
}

export function belowTarget(c: StatsCourse): boolean {
  return c.current_grade !== null && c.target_grade !== null && c.current_grade < c.target_grade;
}

/** Pearson correlation, or null when it isn't meaningful (fewer than 3 points, no spread). */
export function correlation(points: readonly (readonly [number, number])[]): number | null {
  if (points.length < 3) return null;
  const n = points.length;
  const mx = points.reduce((s, [x]) => s + x, 0) / n;
  const my = points.reduce((s, [, y]) => s + y, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (const [x, y] of points) {
    sxy += (x - mx) * (y - my);
    sxx += (x - mx) ** 2;
    syy += (y - my) ** 2;
  }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}

/** The chart's text summary: a few plain sentences a screen reader can read in order. */
export function summarize(stats: StatsOverview): string[] {
  const { courses, weeks } = stats;
  const window = weeks === 1 ? "this week" : `the last ${weeks} weeks`;
  if (courses.length === 0) return ["Add a course to see how your focus time and grades line up."];
  const total = courses.reduce((s, c) => s + c.focus_minutes, 0);
  const lines: string[] = [];
  if (total === 0) {
    lines.push(`No focus time logged in ${window}.`);
  } else {
    const studied = courses.filter((c) => c.focus_minutes > 0).length;
    lines.push(
      `In ${window} you focused ${formatMinutes(total)} across ${studied} ${studied === 1 ? "course" : "courses"}.`,
    );
    const most = [...courses].sort((a, b) => b.focus_minutes - a.focus_minutes)[0];
    if (most) {
      lines.push(
        `Most focus: ${courseLabel(most)}, ${formatMinutes(most.focus_minutes)}${
          most.current_grade !== null ? `, grade ${percent(most.current_grade)}` : ""
        }.`,
      );
    }
  }

  const graded = courses.filter((c) => c.current_grade !== null);
  const lowest = [...graded].sort((a, b) => (a.current_grade ?? 0) - (b.current_grade ?? 0))[0];
  if (lowest && graded.length > 1) {
    lines.push(
      `Lowest grade: ${courseLabel(lowest)}, ${percent(lowest.current_grade ?? 0)}, with ${formatMinutes(lowest.focus_minutes)} of focus.`,
    );
  }
  const below = courses.filter(belowTarget);
  if (below.length) {
    lines.push(
      `Below target: ${below
        .map(
          (c) =>
            `${courseLabel(c)} (${percent(c.current_grade ?? 0)}, target ${percent(c.target_grade ?? 0)})`,
        )
        .join(", ")}.`,
    );
  }
  const r = correlation(graded.map((c) => [c.focus_minutes, c.current_grade ?? 0] as const));
  if (total > 0 && r !== null) {
    lines.push(
      r >= 0.3
        ? "Courses you focused on more tend to have higher grades."
        : r <= -0.3
          ? "Courses you focused on more tend to have lower grades, often because harder courses get more time."
          : "No clear link between focus time and grades yet.",
    );
  }
  const ungraded = courses.filter((c) => c.current_grade === null);
  if (ungraded.length) {
    lines.push(`No grades yet: ${ungraded.map(courseLabel).join(", ")}.`);
  }
  return lines;
}

// Spreadsheet apps run cells that start with these as formulas.
function csvCell(value: string | number | null): string {
  if (value === null) return "";
  let s = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV of the per-course numbers shown on screen. */
export function statsCsv(stats: StatsOverview): string {
  const header = [
    "course_code",
    "course_name",
    "period_start",
    "period_end",
    "focus_minutes",
    "current_grade",
    "letter",
    "target_grade",
  ];
  const rows = stats.courses.map((c) =>
    [
      c.code,
      c.name,
      stats.period_start,
      stats.today,
      c.focus_minutes,
      c.current_grade,
      c.letter,
      c.target_grade,
    ]
      .map(csvCell)
      .join(","),
  );
  return [header.join(","), ...rows].join("\r\n") + "\r\n";
}
