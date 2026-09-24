import { describe, expect, it } from "vitest";

import { formatDue } from "./format.ts";
import {
  inQuietHours,
  onePerAssignment,
  planReminders,
  type PlannedReminder,
  type ReminderAssignment,
  type ReminderPrefs,
} from "./reminders.ts";

const prefs: ReminderPrefs = {
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

const tz = "America/Chicago"; // CST (UTC-6) in early March 2027
const local = (date: string, time: string) => new Date(`${date}T${time}:00-06:00`);
const item = (
  id: string,
  dueAt: Date,
  extra: Partial<ReminderAssignment> = {},
): ReminderAssignment => ({
  id,
  title: id,
  course: "BIO 201",
  kind: "assignment",
  dueAt: dueAt.toISOString(),
  status: "todo",
  ...extra,
});
const plan = (
  now: Date,
  assignments: ReminderAssignment[],
  overrides: Partial<ReminderPrefs> = {},
) => planReminders({ timezone: tz, now, prefs: { ...prefs, ...overrides }, assignments });
const kinds = (r: ReturnType<typeof plan>) => r.map((x) => `${x.kind}:${x.assignmentId ?? "-"}`);

describe("formatDue", () => {
  const now = local("2027-03-01", "12:00");
  it("uses today/tomorrow/date in the user's timezone", () => {
    expect(formatDue(local("2027-03-01", "23:59"), tz, now)).toBe("today at 11:59 PM");
    expect(formatDue(local("2027-03-02", "09:00"), tz, now)).toBe("tomorrow at 9:00 AM");
    expect(formatDue(local("2027-03-05", "14:00"), tz, now)).toBe("Fri, Mar 5 at 2:00 PM");
  });
});

describe("due reminders", () => {
  const noon = local("2027-03-01", "12:00");

  it("sends the 24-hour reminder between 24 h and 2 h out, then the 2-hour one", () => {
    const due = local("2027-03-02", "09:00");
    expect(kinds(plan(noon, [item("lab", due)]))).toEqual(["due_24h:lab"]);
    expect(kinds(plan(local("2027-03-02", "07:15"), [item("lab", due)]))).toEqual(["due_2h:lab"]);
    expect(plan(local("2027-03-02", "07:15"), [item("lab", due)])[0]?.title).toBe(
      "Due soon: lab (today at 9:00 AM)",
    );
  });

  it("skips work more than 24 h out, finished work, and past deadlines", () => {
    expect(
      plan(noon, [
        item("far", local("2027-03-03", "12:00")),
        item("done", local("2027-03-01", "18:00"), { status: "done" }),
        item("past", local("2027-03-01", "11:00")),
      ]),
    ).toEqual([]);
  });

  it("includes the due time in the dedupe key so a moved deadline re-arms it", () => {
    const a = plan(noon, [item("lab", local("2027-03-01", "20:00"))])[0]?.dedupeKey;
    const b = plan(noon, [item("lab", local("2027-03-01", "21:00"))])[0]?.dedupeKey;
    expect(a).not.toBe(b);
  });

  it("respects the per-rule toggles and the push switch", () => {
    const due = [item("lab", local("2027-03-01", "13:00"))];
    expect(plan(noon, due, { remind_2h: false })).toEqual([]);
    expect(plan(noon, due, { push_enabled: false })).toEqual([]);
  });
});

describe("quiet hours", () => {
  it("handles windows that wrap past midnight", () => {
    expect(inQuietHours(23 * 60, prefs)).toBe(true);
    expect(inQuietHours(6 * 60 + 59, prefs)).toBe(true);
    expect(inQuietHours(7 * 60, prefs)).toBe(false);
    expect(inQuietHours(23 * 60, { ...prefs, quiet_hours_enabled: false })).toBe(false);
  });

  it("sends nothing during quiet hours", () => {
    expect(plan(local("2027-03-01", "23:00"), [item("lab", local("2027-03-01", "23:59"))])).toEqual(
      [],
    );
  });

  it("sends a 2-hour reminder that would fall in quiet hours on the last run before them", () => {
    const due = local("2027-03-02", "01:00"); // 2-hour mark is 23:00, inside quiet hours
    expect(kinds(plan(local("2027-03-01", "21:30"), [item("lab", due)]))).toEqual(["due_24h:lab"]);
    const lastRun = plan(local("2027-03-01", "21:45"), [item("lab", due)]);
    expect(kinds(lastRun)).toEqual(["due_2h:lab"]); // replaces the 24-hour one
    expect(lastRun[0]?.title).toBe("Due tomorrow at 1:00 AM: lab");
  });

  it("also covers a 2-hour mark between the last run and the start of quiet hours", () => {
    const due = local("2027-03-01", "23:55"); // mark 21:55: after the 21:45 run, before 22:00
    expect(kinds(plan(local("2027-03-01", "21:45"), [item("lab", due)]))).toContain("due_2h:lab");
  });

  it("leaves 2-hour marks after quiet hours to the normal run", () => {
    const due = local("2027-03-02", "10:00"); // mark 08:00
    expect(kinds(plan(local("2027-03-01", "21:45"), [item("lab", due)]))).toEqual(["due_24h:lab"]);
  });
});

describe("exam countdowns", () => {
  const exam = item("midterm", local("2027-03-08", "10:00"), { kind: "exam" });

  it("fires 7, 3, and 1 days before, at the digest time", () => {
    expect(kinds(plan(local("2027-03-01", "07:30"), [exam]))).toContain("exam_countdown:midterm");
    expect(
      plan(local("2027-03-01", "07:30"), [exam]).find((r) => r.kind === "exam_countdown")?.title,
    ).toBe("midterm is in 7 days");
    expect(kinds(plan(local("2027-03-05", "08:00"), [exam]))).toContain("exam_countdown:midterm");
    expect(
      plan(local("2027-03-07", "07:45"), [exam]).find((r) => r.kind === "exam_countdown")?.title,
    ).toBe("midterm is tomorrow");
  });

  it("doesn't fire on other days, before the digest time, or hours late", () => {
    expect(kinds(plan(local("2027-03-02", "07:30"), [exam]))).not.toContain(
      "exam_countdown:midterm",
    );
    expect(kinds(plan(local("2027-03-01", "07:15"), [exam]))).toEqual([]);
    expect(kinds(plan(local("2027-03-01", "11:00"), [exam]))).not.toContain(
      "exam_countdown:midterm",
    );
  });
});

describe("morning digest", () => {
  const items = [
    item("Lab 3", local("2027-03-01", "23:59")),
    item("Quiz 2", local("2027-03-01", "14:00")),
    item("Essay", local("2027-03-02", "17:00")),
  ];

  it("summarizes today and tomorrow once a day at the chosen time", () => {
    const digest = plan(local("2027-03-01", "07:30"), items).find(
      (r) => r.kind === "morning_digest",
    );
    expect(digest).toEqual({
      kind: "morning_digest",
      dedupeKey: "morning_digest:2027-03-01",
      assignmentId: null,
      title: "2 due today",
      body: "Today: Lab 3, Quiz 2. Tomorrow: Essay",
    });
  });

  it("is skipped when nothing is due today or tomorrow", () => {
    expect(plan(local("2027-03-01", "07:30"), [item("far", local("2027-03-10", "12:00"))])).toEqual(
      [],
    );
  });

  it("waits for quiet hours to end when the digest time is inside them", () => {
    const early = { morning_digest_time: "06:00:00" };
    expect(plan(local("2027-03-01", "06:00"), items, early)).toEqual([]);
    expect(kinds(plan(local("2027-03-01", "07:00"), items, early))).toContain("morning_digest:-");
  });
});

describe("one reminder per assignment", () => {
  it("keeps only the most urgent reminder for an assignment in a run", () => {
    // Exam tomorrow at 07:00: at 07:30 today it is both 1 day out and inside 24 hours.
    const exam = item("final", local("2027-03-02", "07:00"), { kind: "exam" });
    expect(kinds(plan(local("2027-03-01", "07:30"), [exam]))).toEqual([
      "due_24h:final",
      "morning_digest:-",
    ]);
  });

  it("never drops the digest or other assignments", () => {
    const r = (kind: PlannedReminder["kind"], assignmentId: string | null) => ({
      kind,
      assignmentId,
      dedupeKey: `${kind}:${assignmentId ?? "-"}`,
      title: "",
      body: "",
    });
    expect(
      onePerAssignment([
        r("due_2h", "a"),
        r("due_24h", "a"),
        r("due_24h", "b"),
        r("exam_countdown", "b"),
        r("morning_digest", null),
      ]).map((x) => x.dedupeKey),
    ).toEqual(["due_2h:a", "due_24h:b", "morning_digest:-"]);
  });
});
