// Decides which reminders a user should get right now. Pure: the cron function loads
// the data, calls planReminders every 15 minutes, then claims and sends what it returns.
//
// Rules (all in the user's timezone):
// - due_24h        work due in (2 h, 24 h]
// - due_2h         work due in (0, 2 h]
// - exam_countdown exams 7, 3, and 1 days away (local calendar days), sent at the
//                  morning digest time
// - morning_digest once a day at the chosen time: what's due today and tomorrow
// - quiet hours    nothing is sent inside them. A 2-hour reminder that would fall in
//                  quiet hours is sent on the last run before they start; digests and
//                  countdowns whose time falls inside quiet hours wait until they end.
import { addDays, daysBetween, localDate, zonedParts } from "../time/index.ts";
import { formatDue } from "./format.ts";

export type ReminderKind = "due_24h" | "due_2h" | "exam_countdown" | "morning_digest";

export interface ReminderAssignment {
  id: string;
  title: string;
  course: string;
  kind: string;
  dueAt: string;
  status: "todo" | "in_progress" | "done" | "skipped";
}

export interface ReminderPrefs {
  push_enabled: boolean;
  remind_24h: boolean;
  remind_2h: boolean;
  exam_countdown: boolean;
  morning_digest: boolean;
  morning_digest_time: string; // HH:MM[:SS] local
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
  daily_cap: number;
}

export interface ReminderInput {
  timezone: string;
  now: Date;
  prefs: ReminderPrefs;
  assignments: readonly ReminderAssignment[];
}

export interface PlannedReminder {
  kind: ReminderKind;
  /** Identifies "the same reminder"; includes the due time so moved deadlines re-remind. */
  dedupeKey: string;
  assignmentId: string | null;
  title: string;
  body: string;
}

/** How often the cron runs; windows are sized so each reminder fires on one run. */
export const CRON_INTERVAL_MINUTES = 15;
export const EXAM_COUNTDOWN_DAYS = [7, 3, 1] as const;
/** A digest or countdown more than this late (e.g. the cron was down) is skipped. */
const LATE_LIMIT_MINUTES = 180;
const HOUR = 3_600_000;
const DAY_MINUTES = 24 * 60;

/** "22:00" or "22:00:00" -> minutes after midnight. */
export function clockMinutes(time: string): number {
  const [h = 0, m = 0] = time.split(":").map(Number);
  return h * 60 + m;
}

function localMinutes(now: Date, timeZone: string): number {
  const p = zonedParts(now, timeZone);
  return p.hour * 60 + p.minute;
}

/** Whether a local clock time falls in quiet hours (which may wrap past midnight). */
export function inQuietHours(minutes: number, prefs: ReminderPrefs): boolean {
  if (!prefs.quiet_hours_enabled) return false;
  const start = clockMinutes(prefs.quiet_hours_start);
  const end = clockMinutes(prefs.quiet_hours_end);
  if (start === end) return false;
  return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}

/** Minutes from `minutes` forward to the next occurrence of `target` (0-1439). */
function minutesUntil(minutes: number, target: number): number {
  return (target - minutes + DAY_MINUTES) % DAY_MINUTES;
}

/** Minutes past a daily send time, or null if it hasn't come yet today. */
function minutesPast(nowMinutes: number, sendAt: number): number | null {
  return nowMinutes >= sendAt ? nowMinutes - sendAt : null;
}

const open = (a: ReminderAssignment) => a.status === "todo" || a.status === "in_progress";

function dueReminders(input: ReminderInput, nowMinutes: number): PlannedReminder[] {
  const { prefs, now, timezone } = input;
  const t = now.getTime();
  const out: PlannedReminder[] = [];

  // Is this the last run before quiet hours start? Then 2-hour reminders that would
  // otherwise land inside quiet hours go out now.
  const quietStartsIn = prefs.quiet_hours_enabled
    ? minutesUntil(nowMinutes, clockMinutes(prefs.quiet_hours_start))
    : Infinity;
  const quietLength = prefs.quiet_hours_enabled
    ? minutesUntil(clockMinutes(prefs.quiet_hours_start), clockMinutes(prefs.quiet_hours_end))
    : 0;
  const lastRunBeforeQuiet = quietStartsIn > 0 && quietStartsIn <= CRON_INTERVAL_MINUTES;

  for (const a of input.assignments.filter(open)) {
    const due = Date.parse(a.dueAt);
    const left = due - t;
    if (left <= 0) continue;
    const when = formatDue(new Date(due), timezone, now);

    if (prefs.remind_24h && left > 2 * HOUR && left <= 24 * HOUR) {
      out.push({
        kind: "due_24h",
        dedupeKey: `due_24h:${a.id}:${a.dueAt}`,
        assignmentId: a.id,
        title: `${a.title} is due ${when}`,
        body: a.course,
      });
    }

    const twoHourMark = left - 2 * HOUR; // ms until the ideal 2-hour reminder
    // On the last run before quiet hours, any 2-hour mark that no later non-quiet run
    // would catch (it falls before quiet hours end) is sent now instead of lost.
    const markInQuiet =
      lastRunBeforeQuiet && twoHourMark > 0 && twoHourMark < (quietStartsIn + quietLength) * 60_000;
    if (prefs.remind_2h && (left <= 2 * HOUR || markInQuiet)) {
      out.push({
        kind: "due_2h",
        dedupeKey: `due_2h:${a.id}:${a.dueAt}`,
        assignmentId: a.id,
        title: left <= 2 * HOUR ? `Due soon: ${a.title} (${when})` : `Due ${when}: ${a.title}`,
        body: a.course,
      });
    }
  }
  return out;
}

/** The daily send time, pushed to the end of quiet hours if it falls inside them. */
function dailySendMinutes(prefs: ReminderPrefs): number {
  const digest = clockMinutes(prefs.morning_digest_time);
  return inQuietHours(digest, prefs) ? clockMinutes(prefs.quiet_hours_end) : digest;
}

function examCountdowns(
  input: ReminderInput,
  today: string,
  nowMinutes: number,
): PlannedReminder[] {
  if (!input.prefs.exam_countdown) return [];
  const past = minutesPast(nowMinutes, dailySendMinutes(input.prefs));
  if (past === null || past > LATE_LIMIT_MINUTES) return [];
  const out: PlannedReminder[] = [];
  for (const a of input.assignments.filter((x) => open(x) && x.kind === "exam")) {
    const days = daysBetween(today, localDate(new Date(a.dueAt), input.timezone));
    if (!(EXAM_COUNTDOWN_DAYS as readonly number[]).includes(days)) continue;
    out.push({
      kind: "exam_countdown",
      dedupeKey: `exam_countdown:${a.id}:${String(days)}:${a.dueAt}`,
      assignmentId: a.id,
      title: days === 1 ? `${a.title} is tomorrow` : `${a.title} is in ${String(days)} days`,
      body: `${a.course} · ${formatDue(new Date(a.dueAt), input.timezone, input.now)}`,
    });
  }
  return out;
}

function morningDigest(input: ReminderInput, today: string, nowMinutes: number): PlannedReminder[] {
  if (!input.prefs.morning_digest) return [];
  const past = minutesPast(nowMinutes, dailySendMinutes(input.prefs));
  if (past === null || past > LATE_LIMIT_MINUTES) return [];
  const tomorrow = addDays(today, 1);
  const dueOn = (date: string) =>
    input.assignments.filter(
      (a) =>
        open(a) &&
        Date.parse(a.dueAt) > input.now.getTime() &&
        localDate(new Date(a.dueAt), input.timezone) === date,
    );
  const dueToday = dueOn(today);
  const dueTomorrow = dueOn(tomorrow);
  if (!dueToday.length && !dueTomorrow.length) return [];

  const list = (items: ReminderAssignment[]) => {
    const names = items.slice(0, 3).map((a) => a.title);
    return items.length > 3
      ? `${names.join(", ")} and ${String(items.length - 3)} more`
      : names.join(", ");
  };
  const title = dueToday.length
    ? `${String(dueToday.length)} due today`
    : `Nothing due today · ${String(dueTomorrow.length)} due tomorrow`;
  const parts = [
    dueToday.length ? `Today: ${list(dueToday)}` : null,
    dueTomorrow.length ? `Tomorrow: ${list(dueTomorrow)}` : null,
  ];
  return [
    {
      kind: "morning_digest",
      dedupeKey: `morning_digest:${today}`,
      assignmentId: null,
      title,
      body: parts.filter(Boolean).join(". "),
    },
  ];
}

const PRIORITY: Record<ReminderKind, number> = {
  due_2h: 0,
  due_24h: 1,
  exam_countdown: 2,
  morning_digest: 3,
};

/** Keeps the most urgent reminder per assignment (input sorted most urgent first). */
export function onePerAssignment(reminders: readonly PlannedReminder[]): PlannedReminder[] {
  const seen = new Set<string>();
  return reminders.filter((r) => {
    if (r.assignmentId === null) return true;
    if (seen.has(r.assignmentId)) return false;
    seen.add(r.assignmentId);
    return true;
  });
}

/**
 * Reminders to send now, most urgent first, at most one per assignment. Callers claim
 * them with claim_reminders, which dedupes across runs and enforces the daily cap and
 * per-assignment cooldown, so this list can be longer than what is finally sent.
 */
export function planReminders(input: ReminderInput): PlannedReminder[] {
  if (!input.prefs.push_enabled) return [];
  const nowMinutes = localMinutes(input.now, input.timezone);
  if (inQuietHours(nowMinutes, input.prefs)) return [];
  const today = localDate(input.now, input.timezone);
  return onePerAssignment(
    [
      ...dueReminders(input, nowMinutes),
      ...examCountdowns(input, today, nowMinutes),
      ...morningDigest(input, today, nowMinutes),
    ].sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind]),
  );
}
