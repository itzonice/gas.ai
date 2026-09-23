// Study-block scheduler. Allocates each task's remaining minutes to days *backward*
// from its due date, earliest deadline first, within each day's study capacity:
//
// - A block never ends after its task is due.
// - Exam prep (and other big tasks) is capped per day so it spreads over several days
//   instead of one cram session; exams and projects avoid their due day when possible.
// - Existing locked or completed blocks keep their time and consume capacity.
// - Work that doesn't fit is reported as unscheduled, with the overloaded days.
//
// Days are local calendar days in the user's timezone; blocks come back as UTC instants.
import { addDays, localDate, zonedTimeToUtc, type IsoDate } from "../time/index.ts";

export type BlockKind = "study" | "exam_prep" | "review";

export interface SchedulableTask {
  assignmentId: string;
  courseId: string;
  kind: "assignment" | "quiz" | "exam" | "project" | "reading" | "lab" | "discussion" | "other";
  dueAt: string; // ISO instant
  minutesRemaining: number;
  /** Higher first when deadlines tie. */
  priority: number;
}

export interface ExistingBlock {
  startsAt: string;
  endsAt: string;
  /** Minutes of this block that count toward the task it's for (0 if unrelated). */
  assignmentId: string | null;
}

export interface SchedulerOptions {
  timezone: string;
  now: Date;
  /** Minutes available on a local date. */
  capacity: (date: IsoDate) => number;
  /** Local time study starts each day (HH:MM). */
  dayStartTime?: string;
  /** How many days ahead to plan. */
  horizonDays?: number;
  /** Blocks that stay where they are (locked or done) and use up time. */
  existing?: readonly ExistingBlock[];
}

export interface PlannedBlock {
  assignmentId: string;
  courseId: string;
  kind: BlockKind;
  startsAt: string;
  endsAt: string;
  minutes: number;
}

export interface ScheduleResult {
  blocks: PlannedBlock[];
  unscheduled: { assignmentId: string; minutes: number }[];
  /** Days where scheduled demand filled the capacity and some work still didn't fit. */
  overloadedDays: IsoDate[];
}

export const MIN_BLOCK_MINUTES = 25;
/** Longest single block; longer allocations on one day are split with a break. */
export const MAX_BLOCK_MINUTES = 90;
export const BREAK_MINUTES = 10;
/** Exam prep days: at least this many when the calendar allows. */
export const EXAM_PREP_MIN_DAYS = 3;
/** A regular task never takes more than this much of one day. */
export const MAX_TASK_MINUTES_PER_DAY = 180;

const SPREAD_KINDS = new Set<SchedulableTask["kind"]>(["exam", "project"]);

/** Max minutes a task may take on one day. Exams spread over >= 3 days. */
export function perDayCap(task: SchedulableTask): number {
  if (task.kind === "exam")
    return Math.max(60, Math.ceil(task.minutesRemaining / EXAM_PREP_MIN_DAYS));
  if (task.kind === "project") return Math.max(60, Math.ceil(task.minutesRemaining / 2));
  return MAX_TASK_MINUTES_PER_DAY;
}

function roundUpToQuarterHour(date: Date): Date {
  const ms = 15 * 60_000;
  return new Date(Math.ceil(date.getTime() / ms) * ms);
}

interface DaySlot {
  date: IsoDate;
  /** Earliest usable instant this day (window start, or now for today). */
  opensAt: Date;
  /** Minutes still free. */
  free: number;
  /** Next free instant for placing blocks, advanced as blocks are placed. */
  cursor: Date;
}

export function scheduleStudyBlocks(
  tasks: readonly SchedulableTask[],
  options: SchedulerOptions,
): ScheduleResult {
  const {
    timezone,
    now,
    capacity,
    dayStartTime = "16:00",
    horizonDays = 28,
    existing = [],
  } = options;
  const today = localDate(now, timezone);

  // Build the day slots in the horizon, subtracting time already taken.
  const days: DaySlot[] = [];
  for (let i = 0; i <= horizonDays; i++) {
    const date = addDays(today, i);
    const dayEnd = zonedTimeToUtc(addDays(date, 1), "00:00", timezone);
    let free = Math.max(0, capacity(date));
    // Start earlier than the usual time if the day's minutes (plus breaks) wouldn't fit
    // before midnight, but never before 07:00.
    const needed = Math.ceil(free * 1.2);
    const usual = zonedTimeToUtc(date, dayStartTime, timezone);
    const earliest = zonedTimeToUtc(date, "07:00", timezone);
    const latestStart = new Date(dayEnd.getTime() - needed * 60_000);
    const windowStart = new Date(
      Math.max(earliest.getTime(), Math.min(usual.getTime(), latestStart.getTime())),
    );
    free = Math.min(free, Math.floor((dayEnd.getTime() - windowStart.getTime()) / 60_000 / 1.2));
    let opensAt = windowStart;
    if (i === 0) {
      const nowRounded = roundUpToQuarterHour(now);
      if (nowRounded > opensAt) opensAt = nowRounded;
      // Don't plan more than fits in what's left of today.
      free = Math.min(
        free,
        Math.max(0, Math.floor((dayEnd.getTime() - opensAt.getTime()) / 60_000)),
      );
    }
    let cursor = opensAt;
    for (const b of existing) {
      const start = new Date(b.startsAt);
      const end = new Date(b.endsAt);
      if (localDate(start, timezone) !== date) continue;
      free -= Math.round((end.getTime() - start.getTime()) / 60_000);
      if (end > cursor) cursor = end;
    }
    days.push({ date, opensAt, free: Math.max(0, free), cursor });
  }

  const alreadyPlanned = new Map<string, number>();
  for (const b of existing) {
    if (!b.assignmentId) continue;
    const minutes = Math.round((Date.parse(b.endsAt) - Date.parse(b.startsAt)) / 60_000);
    alreadyPlanned.set(b.assignmentId, (alreadyPlanned.get(b.assignmentId) ?? 0) + minutes);
  }

  // Earliest deadline first; ties by priority.
  const ordered = [...tasks]
    .filter((t) => t.minutesRemaining > 0 && Date.parse(t.dueAt) > now.getTime())
    .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt) || b.priority - a.priority);

  const allocations = new Map<
    string,
    { task: SchedulableTask; date: IsoDate; minutes: number }[]
  >();
  const unscheduled: { assignmentId: string; minutes: number }[] = [];
  const overloaded = new Set<IsoDate>();

  for (const task of ordered) {
    let need = task.minutesRemaining - (alreadyPlanned.get(task.assignmentId) ?? 0);
    if (need <= 0) continue;
    const due = new Date(task.dueAt);
    const dueDate = localDate(due, timezone);
    const cap = perDayCap(task);

    // Candidate days, latest first. Exams/projects prefer finishing the day before.
    const usable = days.filter((d) => d.date <= dueDate && d.opensAt < due);
    const preferred = SPREAD_KINDS.has(task.kind) ? usable.filter((d) => d.date < dueDate) : usable;
    const passes = preferred.length ? [preferred, usable] : [usable];
    const taken = new Map<IsoDate, number>();

    for (const pass of passes) {
      for (const day of [...pass].reverse()) {
        if (need <= 0) break;
        // On the due day, only the time before the deadline is usable.
        const beforeDue =
          day.date === dueDate
            ? Math.floor((due.getTime() - day.cursor.getTime()) / 60_000)
            : Infinity;
        const room = Math.min(day.free, beforeDue, cap - (taken.get(day.date) ?? 0));
        if (room < Math.min(MIN_BLOCK_MINUTES, need)) continue;
        const minutes = Math.min(room, need);
        day.free -= minutes;
        taken.set(day.date, (taken.get(day.date) ?? 0) + minutes);
        need -= minutes;
      }
    }
    for (const [date, minutes] of taken) {
      const list = allocations.get(date) ?? [];
      list.push({ task, date, minutes });
      allocations.set(date, list);
    }
    if (need > 0) {
      unscheduled.push({ assignmentId: task.assignmentId, minutes: need });
      for (const d of usable) if (d.free < MIN_BLOCK_MINUTES) overloaded.add(d.date);
    }
  }

  // Place each day's allocations back to back, soonest deadline first, splitting long ones.
  const blocks: PlannedBlock[] = [];
  for (const day of days) {
    const list = (allocations.get(day.date) ?? []).sort(
      (a, b) => Date.parse(a.task.dueAt) - Date.parse(b.task.dueAt),
    );
    let cursor = day.cursor;
    for (const { task, minutes } of list) {
      let left = minutes;
      while (left > 0) {
        const length =
          left > MAX_BLOCK_MINUTES && left - MAX_BLOCK_MINUTES >= MIN_BLOCK_MINUTES
            ? MAX_BLOCK_MINUTES
            : left;
        const startsAt = cursor;
        const endsAt = new Date(startsAt.getTime() + length * 60_000);
        blocks.push({
          assignmentId: task.assignmentId,
          courseId: task.courseId,
          kind: task.kind === "exam" ? "exam_prep" : "study",
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          minutes: length,
        });
        left -= length;
        cursor = new Date(endsAt.getTime() + BREAK_MINUTES * 60_000);
      }
    }
  }

  // Safety net: nothing may end after its task is due (e.g. pushed late by breaks).
  const safe: PlannedBlock[] = [];
  for (const block of blocks) {
    const due = Date.parse(tasks.find((t) => t.assignmentId === block.assignmentId)?.dueAt ?? "");
    const end = Date.parse(block.endsAt);
    if (end <= due) {
      safe.push(block);
      continue;
    }
    const fits = Math.floor((due - Date.parse(block.startsAt)) / 60_000);
    if (fits >= MIN_BLOCK_MINUTES) {
      safe.push({ ...block, endsAt: new Date(due).toISOString(), minutes: fits });
    }
    const lost = block.minutes - Math.max(fits >= MIN_BLOCK_MINUTES ? fits : 0, 0);
    const entry = unscheduled.find((u) => u.assignmentId === block.assignmentId);
    if (entry) entry.minutes += lost;
    else unscheduled.push({ assignmentId: block.assignmentId, minutes: lost });
  }

  return { blocks: safe, unscheduled, overloadedDays: [...overloaded].sort() };
}
