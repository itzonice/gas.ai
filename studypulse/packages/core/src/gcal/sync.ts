// What StudyPulse puts on the student's dedicated Google calendar, and how to get there
// from what's already there. Pure: the sync function loads rows, calls diffEvents(),
// and applies the result through the API.
import type { BusyRange, GoogleEventBody } from "./calendar.ts";

export interface SyncBlock {
  id: string;
  kind: "study" | "review" | "exam_prep" | "practice_quiz";
  status: "planned" | "done" | "missed";
  startsAt: string;
  endsAt: string;
  courseLabel: string;
  title: string | null;
}

export interface SyncDeadline {
  id: string;
  title: string;
  kind: string;
  courseLabel: string;
  dueAt: string;
  /** Local due date and time in the student's timezone. */
  localDate: string;
  localTime: string;
}

export interface DesiredEvent {
  /** Stable key: "block:<id>" or "due:<id>". */
  key: string;
  body: GoogleEventBody;
  /** Changes when anything shown in Google changes. */
  hash: string;
}

export interface MappedEvent {
  key: string;
  eventId: string;
  hash: string;
}

const BLOCK_LABELS: Record<SyncBlock["kind"], string> = {
  study: "Study",
  review: "Review",
  exam_prep: "Exam prep",
  practice_quiz: "Closed-note practice quiz",
};

function addDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function time12(hhmm: string): string {
  const [h = 0, m = 0] = hhmm.split(":").map(Number);
  const suffix = h < 12 ? "AM" : "PM";
  return `${String(((h + 11) % 12) + 1)}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** A tiny stable hash (FNV-1a) of the event body, to skip unchanged events. */
export function hashBody(body: GoogleEventBody): string {
  const text = JSON.stringify(body);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export function blockEvent(block: SyncBlock): DesiredEvent {
  const label = BLOCK_LABELS[block.kind];
  const what = block.kind === "practice_quiz" || !block.title ? "" : `: ${block.title}`;
  const key = `block:${block.id}`;
  const body: GoogleEventBody = {
    summary: `${block.status === "done" ? "✓ " : ""}${label}${what} (${block.courseLabel})`,
    description: "Planned by StudyPulse.",
    start: { dateTime: block.startsAt },
    end: { dateTime: block.endsAt },
    transparency: "opaque",
    extendedProperties: { private: { studypulseKey: key } },
    reminders: { useDefault: false },
  };
  return { key, body, hash: hashBody(body) };
}

/** Deadlines are all-day events on the due date, with the due time in the title. */
export function deadlineEvent(d: SyncDeadline): DesiredEvent {
  const key = `due:${d.id}`;
  const body: GoogleEventBody = {
    summary: `Due ${time12(d.localTime)}: ${d.title} (${d.courseLabel})`,
    description: `Due ${d.dueAt}. From StudyPulse.`,
    start: { date: d.localDate },
    end: { date: addDay(d.localDate) },
    transparency: "transparent",
    extendedProperties: { private: { studypulseKey: key } },
    reminders: { useDefault: false },
  };
  return { key, body, hash: hashBody(body) };
}

export interface EventDiff {
  create: DesiredEvent[];
  update: { eventId: string; event: DesiredEvent }[];
  remove: { key: string; eventId: string }[];
}

export function diffEvents(
  desired: readonly DesiredEvent[],
  mapped: readonly MappedEvent[],
): EventDiff {
  const byKey = new Map(mapped.map((m) => [m.key, m]));
  const wanted = new Set(desired.map((d) => d.key));
  const diff: EventDiff = { create: [], update: [], remove: [] };
  for (const event of desired) {
    const existing = byKey.get(event.key);
    if (!existing) diff.create.push(event);
    else if (existing.hash !== event.hash) diff.update.push({ eventId: existing.eventId, event });
  }
  for (const m of mapped) {
    if (!wanted.has(m.key)) diff.remove.push({ key: m.key, eventId: m.eventId });
  }
  return diff;
}

/** Sorted, merged busy ranges (Google may return overlaps across calendars). */
export function mergeBusy(ranges: readonly BusyRange[]): BusyRange[] {
  const sorted = [...ranges]
    .filter((r) => Date.parse(r.endsAt) > Date.parse(r.startsAt))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const out: BusyRange[] = [];
  for (const r of sorted) {
    const last = out.at(-1);
    if (last && Date.parse(r.startsAt) <= Date.parse(last.endsAt)) {
      if (Date.parse(r.endsAt) > Date.parse(last.endsAt)) last.endsAt = r.endsAt;
    } else {
      out.push({ ...r });
    }
  }
  return out;
}
