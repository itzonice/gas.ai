import type { CalendarItem } from "@studypulse/core/api";
import { describe, expect, it } from "vitest";

import {
  addMonths,
  daySummary,
  itemTime,
  monthGrid,
  moveFocus,
  rangeFor,
  rangeLabel,
  step,
  weekStart,
} from "./model";

const item = (extra: Partial<CalendarItem>): CalendarItem => ({
  type: "due",
  id: "00000000-0000-0000-0000-000000000001",
  title: "Lab",
  kind: "lab",
  status: "todo",
  course_id: "00000000-0000-0000-0000-00000000c001",
  date: "2026-10-01",
  starts_at: "2026-10-01T22:00:00Z",
  ends_at: null,
  overdue: false,
  ...extra,
});

describe("calendar dates", () => {
  it("starts weeks on Monday", () => {
    expect(weekStart("2026-10-01")).toBe("2026-09-28"); // Thursday -> Monday
    expect(weekStart("2026-10-04")).toBe("2026-09-28"); // Sunday -> previous Monday
    expect(weekStart("2026-09-28")).toBe("2026-09-28");
  });

  it("builds whole weeks around a month", () => {
    const weeks = monthGrid("2026-10-15");
    expect(weeks[0]?.[0]).toBe("2026-09-28");
    expect(weeks.at(-1)?.[6]).toBe("2026-11-01");
    expect(weeks).toHaveLength(5);
    expect(monthGrid("2027-02-10")).toHaveLength(4); // Feb 2027 starts on a Monday
    expect(rangeFor("month", "2026-10-15")).toEqual({ from: "2026-09-28", to: "2026-11-01" });
    expect(rangeFor("week", "2026-10-15")).toEqual({ from: "2026-10-12", to: "2026-10-18" });
  });

  it("clamps month steps to the last day", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
    expect(step("week", "2026-10-01", -1)).toBe("2026-09-24");
  });

  it("moves focus like a date grid", () => {
    expect(moveFocus("2026-10-01", "ArrowRight", "month")).toBe("2026-10-02");
    expect(moveFocus("2026-10-01", "ArrowUp", "month")).toBe("2026-09-24");
    expect(moveFocus("2026-10-01", "Home", "month")).toBe("2026-09-28");
    expect(moveFocus("2026-10-01", "End", "month")).toBe("2026-10-04");
    expect(moveFocus("2026-10-31", "PageDown", "month")).toBe("2026-11-30");
    expect(moveFocus("2026-10-01", "PageDown", "week")).toBe("2026-10-08");
    expect(moveFocus("2026-10-01", "a", "month")).toBeNull();
  });

  it("labels ranges, items, and days", () => {
    expect(rangeLabel("month", "2026-10-15")).toBe("October 2026");
    expect(rangeLabel("week", "2026-10-01")).toMatch(/^Sep 28\s?–\s?Oct 4, 2026$/);
    expect(itemTime(item({}), "America/Chicago")).toBe("Due 5:00 PM");
    expect(
      itemTime(
        item({ type: "study", kind: "review", ends_at: "2026-10-01T23:00:00Z" }),
        "America/Chicago",
      ),
    ).toMatch(/^Review 5:00\s?–\s?6:00\sPM$/);
    expect(daySummary([])).toBe("Nothing scheduled");
    expect(daySummary([item({}), item({ type: "study" })])).toBe("2 items: 1 due, 1 study session");
  });
});
