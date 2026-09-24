// Decides which reminders a user should get right now. Pure: the cron function loads
// the data, calls planReminders, then claims and sends what it returns.
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

const HOUR = 3_600_000;

/** Reminder for work due within the next 24 hours (not yet done). */
function dueSoon(input: ReminderInput): PlannedReminder[] {
  if (!input.prefs.remind_24h) return [];
  const now = input.now.getTime();
  return input.assignments
    .filter((a) => a.status === "todo" || a.status === "in_progress")
    .filter((a) => {
      const due = Date.parse(a.dueAt);
      return due > now && due - now <= 24 * HOUR;
    })
    .map((a) => ({
      kind: "due_24h",
      dedupeKey: `due_24h:${a.id}:${a.dueAt}`,
      assignmentId: a.id,
      title: `${a.title} is due ${formatDue(new Date(a.dueAt), input.timezone, input.now)}`,
      body: a.course,
    }));
}

/** Reminders to send now, soonest deadline first. Excludes nothing yet sent: callers dedupe. */
export function planReminders(input: ReminderInput): PlannedReminder[] {
  if (!input.prefs.push_enabled) return [];
  return dueSoon(input);
}
