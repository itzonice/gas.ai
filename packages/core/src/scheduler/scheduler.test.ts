import { describe, expect, it } from "vitest";

import { localDate } from "../time/index.ts";
import { scheduleStudyBlocks, type SchedulableTask } from "./index.ts";

const tz = "America/Chicago";
const now = new Date("2027-03-01T15:00:00Z"); // Mon 09:00 local
const at = (date: string, time: string) => new Date(`${date}T${time}:00-06:00`).toISOString();
const task = (
  overrides: Partial<SchedulableTask> & Pick<SchedulableTask, "assignmentId" | "dueAt">,
): SchedulableTask => ({
  courseId: "c1",
  kind: "assignment",
  minutesRemaining: 60,
  priority: 50,
  ...overrides,
});
const minutesBy = (
  blocks: { assignmentId: string; minutes: number; startsAt: string }[],
  id: string,
) => blocks.filter((b) => b.assignmentId === id).reduce((s, b) => s + b.minutes, 0);
const daysOf = (blocks: { assignmentId: string; startsAt: string }[], id: string) =>
  [
    ...new Set(
      blocks.filter((b) => b.assignmentId === id).map((b) => localDate(new Date(b.startsAt), tz)),
    ),
  ].sort();

describe("scheduleStudyBlocks", () => {
  it("schedules backward from the due date, ending before it", () => {
    const r = scheduleStudyBlocks(
      [task({ assignmentId: "hw", dueAt: at("2027-03-05", "23:59"), minutesRemaining: 60 })],
      {
        timezone: tz,
        now,
        capacity: () => 120,
      },
    );
    expect(r.unscheduled).toEqual([]);
    expect(daysOf(r.blocks, "hw")).toEqual(["2027-03-05"]); // latest day with room
    expect(r.blocks[0]).toMatchObject({
      startsAt: at("2027-03-05", "16:00"),
      minutes: 60,
      kind: "study",
    });
  });

  it("spreads exam prep over at least three days before the exam day", () => {
    const r = scheduleStudyBlocks(
      [
        task({
          assignmentId: "exam",
          kind: "exam",
          dueAt: at("2027-03-10", "10:00"),
          minutesRemaining: 360,
        }),
      ],
      { timezone: tz, now, capacity: () => 240 },
    );
    const days = daysOf(r.blocks, "exam");
    expect(days.length).toBeGreaterThanOrEqual(3);
    expect(days.every((d) => d < "2027-03-10")).toBe(true);
    expect(minutesBy(r.blocks, "exam")).toBe(360);
    expect(r.blocks.every((b) => b.kind === "exam_prep")).toBe(true);
  });

  it("never schedules past a due time, even on the due day", () => {
    const r = scheduleStudyBlocks(
      [task({ assignmentId: "q", dueAt: at("2027-03-01", "17:00"), minutesRemaining: 300 })],
      {
        timezone: tz,
        now,
        capacity: () => 480,
      },
    );
    for (const b of r.blocks)
      expect(Date.parse(b.endsAt)).toBeLessThanOrEqual(Date.parse(at("2027-03-01", "17:00")));
    expect(r.unscheduled[0]?.minutes).toBeGreaterThan(0);
  });

  it("gives earlier deadlines first claim on capacity and reports overload", () => {
    const r = scheduleStudyBlocks(
      [
        task({ assignmentId: "later", dueAt: at("2027-03-03", "23:59"), minutesRemaining: 120 }),
        task({ assignmentId: "sooner", dueAt: at("2027-03-02", "23:59"), minutesRemaining: 120 }),
      ],
      { timezone: tz, now, capacity: () => 60, horizonDays: 2 },
    );
    expect(minutesBy(r.blocks, "sooner")).toBe(120); // Mon + Tue
    expect(minutesBy(r.blocks, "later")).toBe(60); // only Wed left
    expect(r.unscheduled).toEqual([{ assignmentId: "later", minutes: 60 }]);
    expect(r.overloadedDays).toEqual(["2027-03-01", "2027-03-02", "2027-03-03"]);
  });

  it("respects capacity, locked blocks, and time already planned for a task", () => {
    const r = scheduleStudyBlocks(
      [task({ assignmentId: "hw", dueAt: at("2027-03-02", "23:59"), minutesRemaining: 150 })],
      {
        timezone: tz,
        now,
        capacity: () => 100,
        horizonDays: 1,
        existing: [
          {
            startsAt: at("2027-03-02", "16:00"),
            endsAt: at("2027-03-02", "17:00"),
            assignmentId: null,
          },
          {
            startsAt: at("2027-03-01", "16:00"),
            endsAt: at("2027-03-01", "16:30"),
            assignmentId: "hw",
          },
        ],
      },
    );
    // 30 min already planned; Tue has 40 free after the locked hour, Mon has 70.
    expect(minutesBy(r.blocks, "hw")).toBe(110);
    const tuesday = r.blocks.find((b) => localDate(new Date(b.startsAt), tz) === "2027-03-02");
    expect(tuesday?.startsAt).toBe(at("2027-03-02", "17:00")); // after the locked block
  });

  it("splits long sessions with breaks and doesn't plan the past", () => {
    const r = scheduleStudyBlocks(
      [task({ assignmentId: "p", dueAt: at("2027-03-01", "23:59"), minutesRemaining: 150 })],
      {
        timezone: tz,
        now: new Date(at("2027-03-01", "18:07")),
        capacity: () => 300,
      },
    );
    expect(r.blocks.map((b) => [b.startsAt, b.minutes])).toEqual([
      [at("2027-03-01", "18:15"), 90],
      [at("2027-03-01", "19:55"), 60],
    ]);
  });

  it("ignores finished and past-due tasks", () => {
    const r = scheduleStudyBlocks(
      [
        task({ assignmentId: "past", dueAt: at("2027-02-28", "23:59") }),
        task({ assignmentId: "none", dueAt: at("2027-03-03", "12:00"), minutesRemaining: 0 }),
      ],
      { timezone: tz, now, capacity: () => 120 },
    );
    expect(r.blocks).toEqual([]);
    expect(r.unscheduled).toEqual([]);
  });
});
