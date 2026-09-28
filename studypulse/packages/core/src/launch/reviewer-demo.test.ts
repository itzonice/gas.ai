import { describe, expect, it } from "vitest";

import { PLAN_FEATURES } from "../plans/index.ts";
import { reviewerDemo } from "./reviewer-demo.ts";

const today = "2026-10-05";
const demo = reviewerDemo(today);

describe("reviewer demo account data", () => {
  it("fits the free plan, so reviewers see what a new student gets", () => {
    const limit = Number(PLAN_FEATURES.find((f) => f.label === "Active courses")?.free);
    expect(limit).toBeGreaterThan(0);
    expect(demo.courses.length).toBeLessThanOrEqual(limit);
  });

  it("has category weights that add up to 100 in every course", () => {
    for (const c of demo.courses) {
      const sum = demo.categories
        .filter((g) => g.course === c.key)
        .reduce((s, g) => s + g.weight, 0);
      expect(sum).toBe(100);
    }
  });

  it("files every assignment under one of its course's categories", () => {
    for (const a of demo.assignments) {
      expect(demo.categories.some((g) => g.course === a.course && g.name === a.category)).toBe(
        true,
      );
    }
  });

  it("is mid-term: graded past work, and something due today and soon", () => {
    const now = Date.parse(`${today}T12:00:00Z`);
    const past = demo.assignments.filter((a) => Date.parse(a.due_at) < now);
    const soon = demo.assignments.filter(
      (a) => Date.parse(a.due_at) >= now && Date.parse(a.due_at) < now + 7 * 86_400_000,
    );
    expect(past.some((a) => a.points_earned !== null)).toBe(true);
    expect(soon.length).toBeGreaterThanOrEqual(3);
    expect(demo.assignments.every((a) => a.points_earned === null || a.status === "done")).toBe(
      true,
    );
  });

  it("stores local due times in UTC for the account's timezone", () => {
    const lab = demo.assignments.find((a) => a.title === "Lab 3: Enzyme Kinetics");
    // 11:59 PM in New York (EDT, UTC-4) on the 5th is 03:59 UTC on the 6th.
    expect(lab?.due_at).toBe("2026-10-06T03:59:00.000Z");
  });

  it("logs focus sessions in the past, each on real work from its course", () => {
    expect(demo.sessions.length).toBeGreaterThan(10);
    for (const s of demo.sessions) {
      expect(Date.parse(s.ended_at)).toBeGreaterThan(Date.parse(s.started_at));
      expect(Date.parse(s.ended_at)).toBeLessThan(Date.parse(`${today}T00:00:00Z`) + 86_400_000);
      expect(demo.assignments.some((a) => a.course === s.course && a.title === s.title)).toBe(true);
    }
  });
});
