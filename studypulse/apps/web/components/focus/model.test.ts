import { describe, expect, it } from "vitest";

import {
  announce,
  clockInWords,
  defaultLength,
  elapsedMs,
  finishAt,
  formatClock,
  parseStoredRun,
  phaseOf,
  remainingMs,
  sessionWhen,
  type FocusRun,
} from "./model";

const target = {
  courseId: "c1",
  assignmentId: "a1",
  blockId: null,
  title: "Lab 3",
  courseCode: "BIO 201",
  courseColor: null,
  dueAt: null,
};
const t0 = "2027-03-01T15:00:00.000Z";
const at = (min: number, sec = 0) => new Date(Date.parse(t0) + min * 60_000 + sec * 1000);

describe("focus timer", () => {
  const running: FocusRun = {
    target,
    lengthMinutes: 25,
    doneMs: 0,
    current: { sessionId: "s1", startedAt: t0 },
  };

  it("counts down from timestamps", () => {
    expect(phaseOf(null)).toBe("idle");
    expect(phaseOf(running)).toBe("running");
    expect(remainingMs(running, at(10))).toBe(15 * 60_000);
    expect(remainingMs(running, at(40))).toBe(0);
  });

  it("does not count paused time", () => {
    const paused: FocusRun = { ...running, doneMs: 10 * 60_000, current: null };
    expect(phaseOf(paused)).toBe("paused");
    expect(remainingMs(paused, at(500))).toBe(15 * 60_000);
    const resumed: FocusRun = {
      ...paused,
      current: { sessionId: "s2", startedAt: at(30).toISOString() },
    };
    expect(elapsedMs(resumed, at(35))).toBe(15 * 60_000);
    // The last stretch ends when the total reaches the length, however late we notice.
    expect(finishAt(resumed)?.toISOString()).toBe(at(45).toISOString());
  });

  it("formats the clock, rounding up", () => {
    expect(formatClock(25 * 60_000)).toBe("25:00");
    expect(formatClock(59_001)).toBe("1:00");
    expect(formatClock(500)).toBe("0:01");
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(90 * 60_000)).toBe("1:30:00");
    expect(clockInWords(24 * 60_000 + 30_000)).toBe("24 minutes 30 seconds left");
    expect(clockInWords(60_000)).toBe("1 minute left");
    expect(clockInWords(0)).toBe("0 seconds left");
  });

  it("announces start, pause, and finish in words", () => {
    expect(announce.start(running, false)).toBe("Focus started: 25 minutes on Lab 3.");
    expect(announce.start(running, true)).toBe("Focus resumed on Lab 3.");
    expect(announce.pause(running, at(24, 30))).toBe("Paused with 1 minute left.");
    expect(announce.finish(running, 25 * 60_000, false)).toBe(
      "Focus session finished: 25 minutes on Lab 3.",
    );
    expect(announce.finish(running, 61_000, true)).toBe("Session ended: 1 minute on Lab 3.");
  });

  it("uses the block's length when linked to one", () => {
    expect(defaultLength(45)).toBe(45);
    expect(defaultLength(null)).toBe(25);
    expect(defaultLength(0)).toBe(25);
  });

  it("formats session times in the user's timezone", () => {
    expect(sessionWhen("2027-03-01T15:05:00Z", "2027-03-01T15:30:00Z", "America/Chicago")).toBe(
      "Mar 1, 9:05 – 9:30 AM",
    );
  });

  it("rejects malformed stored runs", () => {
    expect(parseStoredRun(JSON.parse(JSON.stringify(running)))).toEqual(running);
    expect(parseStoredRun({ ...running, lengthMinutes: -1 })).toBeNull();
    expect(parseStoredRun({ ...running, current: { sessionId: 1 } })).toBeNull();
    expect(parseStoredRun("nope")).toBeNull();
  });
});
