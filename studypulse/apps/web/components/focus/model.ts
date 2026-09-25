// Pure timer math and wording for the Focus screen. Time is always derived from
// timestamps (never from counting ticks), so a backgrounded tab or a sleeping laptop
// shows the right time when it wakes up.

export const LENGTH_OPTIONS = [15, 25, 45, 50, 60, 90] as const;
export const DEFAULT_LENGTH = 25;

/** What the timer is for. A session always needs a course; the assignment is optional. */
export interface FocusTarget {
  courseId: string;
  assignmentId: string | null;
  blockId: string | null;
  title: string;
  courseCode: string;
  courseColor: string | null;
  dueAt: string | null;
}

/**
 * One focus run: a countdown that may be paused and resumed. Each stretch of running
 * time is its own study session on the server (pausing stops it; resuming starts a new
 * one), so paused time never counts as studied.
 */
export interface FocusRun {
  target: FocusTarget;
  lengthMinutes: number;
  /** Milliseconds studied in stretches that have already stopped. */
  doneMs: number;
  /** The stretch running now, or null while paused. */
  current: { sessionId: string; startedAt: string } | null;
}

export type Phase = "idle" | "running" | "paused";

export function phaseOf(run: FocusRun | null): Phase {
  if (!run) return "idle";
  return run.current ? "running" : "paused";
}

export function elapsedMs(run: FocusRun, now: Date): number {
  const running = run.current
    ? Math.max(0, now.getTime() - new Date(run.current.startedAt).getTime())
    : 0;
  return run.doneMs + running;
}

export function remainingMs(run: FocusRun, now: Date): number {
  return Math.max(0, run.lengthMinutes * 60_000 - elapsedMs(run, now));
}

/**
 * When the running stretch should end so the run totals exactly its length. Used as the
 * session's ended_at when the countdown reaches zero while the tab was asleep, so the
 * server never records more time than the timer showed.
 */
export function finishAt(run: FocusRun): Date | null {
  if (!run.current) return null;
  const left = run.lengthMinutes * 60_000 - run.doneMs;
  return new Date(new Date(run.current.startedAt).getTime() + Math.max(0, left));
}

/** 1_499_000 -> "25:00"; rounds up so the clock never shows 0:00 while time is left. */
export function formatClock(ms: number): string {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}

/** The same time in words, for the timer's accessible name ("24 minutes 30 seconds left"). */
export function clockInWords(ms: number): string {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  const parts: string[] = [];
  if (m > 0) parts.push(`${m} ${m === 1 ? "minute" : "minutes"}`);
  if (s > 0 || m === 0) parts.push(`${s} ${s === 1 ? "second" : "seconds"}`);
  return `${parts.join(" ")} left`;
}

/** Minutes left, rounded up (for announcements). */
function minutesLeft(ms: number): number {
  return Math.max(1, Math.ceil(ms / 60_000));
}

/** Live-region messages: only start, pause, and finish are ever announced. */
export const announce = {
  start(run: FocusRun, resumed: boolean): string {
    return resumed
      ? `Focus resumed on ${run.target.title}.`
      : `Focus started: ${run.lengthMinutes} minutes on ${run.target.title}.`;
  },
  pause(run: FocusRun, now: Date): string {
    const left = minutesLeft(remainingMs(run, now));
    return `Paused with ${left} ${left === 1 ? "minute" : "minutes"} left.`;
  },
  finish(run: FocusRun, studiedMs: number, early: boolean): string {
    const mins = Math.floor(studiedMs / 60_000);
    const what = `${mins} ${mins === 1 ? "minute" : "minutes"} on ${run.target.title}`;
    return early ? `Session ended: ${what}.` : `Focus session finished: ${what}.`;
  },
};

/** Default length for a target: the linked study block's length, else 25 minutes. */
export function defaultLength(blockMinutes: number | null | undefined): number {
  if (blockMinutes && blockMinutes > 0) return Math.min(blockMinutes, 12 * 60);
  return DEFAULT_LENGTH;
}

/** "Sep 24, 3:05–3:30 PM" in the user's timezone. */
export function sessionWhen(startedAt: string, endedAt: string, timeZone: string): string {
  const day = new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric" });
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  });
  const start = new Date(startedAt);
  const end = new Date(endedAt);
  // ICU puts thin and narrow no-break spaces around the dash and before AM/PM.
  return `${day.format(start)}, ${time.formatRange(start, end)}`.replace(/[\u2009\u202f]/g, " ");
}

/** Validates a stored run (it comes from browser storage, so it is untrusted). */
export function parseStoredRun(value: unknown): FocusRun | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  const t = v.target as Record<string, unknown> | undefined;
  const c = v.current as Record<string, unknown> | null | undefined;
  const str = (x: unknown) => typeof x === "string";
  const strOrNull = (x: unknown) => x === null || typeof x === "string";
  if (
    !t ||
    !str(t.courseId) ||
    !strOrNull(t.assignmentId) ||
    !strOrNull(t.blockId) ||
    !str(t.title) ||
    !str(t.courseCode) ||
    !strOrNull(t.courseColor) ||
    !strOrNull(t.dueAt) ||
    typeof v.lengthMinutes !== "number" ||
    !Number.isFinite(v.lengthMinutes) ||
    v.lengthMinutes <= 0 ||
    typeof v.doneMs !== "number" ||
    !Number.isFinite(v.doneMs) ||
    v.doneMs < 0 ||
    !(c === null || (c && str(c.sessionId) && str(c.startedAt)))
  ) {
    return null;
  }
  return value as FocusRun;
}
