import { describe, expect, it } from "vitest";

import { formatDue } from "./format.ts";
import { planReminders, type ReminderInput, type ReminderPrefs } from "./reminders.ts";

export const defaultPrefs: ReminderPrefs = {
  push_enabled: true,
  remind_24h: true,
  remind_2h: true,
  exam_countdown: true,
  morning_digest: true,
  morning_digest_time: "07:30:00",
  quiet_hours_enabled: true,
  quiet_hours_start: "22:00:00",
  quiet_hours_end: "07:00:00",
  daily_cap: 6,
};

const tz = "America/Chicago";
const now = new Date("2027-03-01T18:00:00Z"); // Mon 12:00 CST
const inHours = (h: number) => new Date(now.getTime() + h * 3_600_000).toISOString();
const base = (overrides: Partial<ReminderInput> = {}): ReminderInput => ({
  timezone: tz,
  now,
  prefs: defaultPrefs,
  assignments: [
    {
      id: "a",
      title: "Lab 3",
      course: "BIO 201",
      kind: "lab",
      dueAt: inHours(11.98),
      status: "todo",
    },
    {
      id: "b",
      title: "Essay",
      course: "HIST 110",
      kind: "project",
      dueAt: inHours(30),
      status: "todo",
    },
    { id: "c", title: "Quiz", course: "PSYC 101", kind: "quiz", dueAt: inHours(3), status: "done" },
  ],
  ...overrides,
});

describe("formatDue", () => {
  it("uses today/tomorrow/date in the user's timezone", () => {
    expect(formatDue(new Date("2027-03-02T05:59:00Z"), tz, now)).toBe("today at 11:59 PM");
    expect(formatDue(new Date("2027-03-02T15:00:00Z"), tz, now)).toBe("tomorrow at 9:00 AM");
    expect(formatDue(new Date("2027-03-05T20:00:00Z"), tz, now)).toBe("Fri, Mar 5 at 2:00 PM");
  });
});

describe("planReminders (due within 24 hours)", () => {
  it("reminds about open work due in the next 24 hours, with a due-time dedupe key", () => {
    const r = planReminders(base());
    expect(r).toEqual([
      {
        kind: "due_24h",
        dedupeKey: `due_24h:a:${inHours(11.98)}`,
        assignmentId: "a",
        title: "Lab 3 is due today at 11:58 PM",
        body: "BIO 201",
      },
    ]);
  });

  it("respects the push and 24-hour toggles", () => {
    expect(planReminders(base({ prefs: { ...defaultPrefs, push_enabled: false } }))).toEqual([]);
    expect(planReminders(base({ prefs: { ...defaultPrefs, remind_24h: false } }))).toEqual([]);
  });
});
