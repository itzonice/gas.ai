// Pure date math for the calendar screen. Dates are local calendar dates (YYYY-MM-DD) in
// the user's timezone, which the server already applied; weeks start on Monday to match
// the rest of StudyPulse.
import type { CalendarItem } from "@studypulse/core/api";
import { addDays, dayOfWeek, type IsoDate } from "@studypulse/core/time";

export type CalendarView = "month" | "week";

export function weekStart(date: IsoDate): IsoDate {
  return addDays(date, -((dayOfWeek(date) + 6) % 7));
}

export function weekDates(date: IsoDate): IsoDate[] {
  const start = weekStart(date);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

const monthOf = (date: IsoDate) => date.slice(0, 7);

/** Whole weeks (Monday to Sunday) covering the month that contains `date`. */
export function monthGrid(date: IsoDate): IsoDate[][] {
  const first = `${monthOf(date)}-01`;
  const weeks: IsoDate[][] = [];
  let start = weekStart(first);
  do {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(start, i)));
    start = addDays(start, 7);
  } while (monthOf(start) === monthOf(first));
  return weeks;
}

export function rangeFor(view: CalendarView, date: IsoDate): { from: IsoDate; to: IsoDate } {
  if (view === "week") {
    const days = weekDates(date);
    return { from: days[0] ?? date, to: days[6] ?? date };
  }
  const weeks = monthGrid(date);
  return { from: weeks[0]?.[0] ?? date, to: weeks.at(-1)?.[6] ?? date };
}

/** The same day of the month `months` away, clamped to that month's last day. */
export function addMonths(date: IsoDate, months: number): IsoDate {
  const [y = 0, m = 1, d = 1] = date.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0));
  const day = Math.min(d, lastDay.getUTCDate());
  return new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), day))
    .toISOString()
    .slice(0, 10);
}

/** Where a grid key moves the focused day, or null if the key isn't a navigation key. */
export function moveFocus(date: IsoDate, key: string, view: CalendarView): IsoDate | null {
  switch (key) {
    case "ArrowLeft":
      return addDays(date, -1);
    case "ArrowRight":
      return addDays(date, 1);
    case "ArrowUp":
      return addDays(date, -7);
    case "ArrowDown":
      return addDays(date, 7);
    case "Home":
      return weekStart(date);
    case "End":
      return addDays(weekStart(date), 6);
    case "PageUp":
      return view === "month" ? addMonths(date, -1) : addDays(date, -7);
    case "PageDown":
      return view === "month" ? addMonths(date, 1) : addDays(date, 7);
    default:
      return null;
  }
}

/** Previous or next page of the current view. */
export function step(view: CalendarView, date: IsoDate, direction: -1 | 1): IsoDate {
  return view === "month" ? addMonths(date, direction) : addDays(date, 7 * direction);
}

export function groupByDate(items: readonly CalendarItem[]): Map<IsoDate, CalendarItem[]> {
  const out = new Map<IsoDate, CalendarItem[]>();
  for (const item of items) {
    const list = out.get(item.date);
    if (list) list.push(item);
    else out.set(item.date, [item]);
  }
  return out;
}

const utc = (date: IsoDate) => new Date(`${date}T00:00:00Z`);
const fmt = (options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...options });

/** "October 2026", or "Sep 28 – Oct 4, 2026" for a week. */
export function rangeLabel(view: CalendarView, date: IsoDate): string {
  if (view === "month") return fmt({ month: "long", year: "numeric" }).format(utc(date));
  const days = weekDates(date);
  return fmt({ month: "short", day: "numeric", year: "numeric" }).formatRange(
    utc(days[0] ?? date),
    utc(days[6] ?? date),
  );
}

/** "Thursday, October 1". */
export function dayLabel(date: IsoDate): string {
  return fmt({ weekday: "long", month: "long", day: "numeric" }).format(utc(date));
}

/** "Thu 1" for week column headings. */
export function shortDayLabel(date: IsoDate): string {
  return fmt({ weekday: "short", day: "numeric" }).format(utc(date));
}

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export const WEEKDAYS_LONG = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

/** "Due 5:00 PM" or "Study 3:00–4:00 PM", in the user's timezone. */
export function itemTime(item: CalendarItem, timeZone: string): string {
  const time = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" });
  if (item.type === "due") return `Due ${time.format(new Date(item.starts_at))}`;
  const label =
    item.kind === "review"
      ? "Review"
      : item.kind === "exam_prep"
        ? "Exam prep"
        : item.kind === "practice_quiz"
          ? "Practice quiz"
          : "Study";
  return item.ends_at
    ? `${label} ${time.formatRange(new Date(item.starts_at), new Date(item.ends_at))}`
    : `${label} ${time.format(new Date(item.starts_at))}`;
}

/** One-line summary of a day for screen readers: "3 items: 2 due, 1 study session". */
export function daySummary(items: readonly CalendarItem[] | undefined): string {
  if (!items?.length) return "Nothing scheduled";
  const due = items.filter((i) => i.type === "due").length;
  const study = items.length - due;
  const parts = [
    due ? `${due} due` : null,
    study ? `${study} study ${study === 1 ? "session" : "sessions"}` : null,
  ].filter(Boolean);
  return `${items.length} ${items.length === 1 ? "item" : "items"}: ${parts.join(", ")}`;
}
