import { describe, expect, it } from "vitest";

import {
  addDays,
  dayOfWeek,
  daysBetween,
  localDate,
  localDayBounds,
  offsetMinutes,
  zonedTimeToUtc,
} from "./index.ts";

describe("zonedTimeToUtc", () => {
  it("converts local wall time to UTC", () => {
    expect(zonedTimeToUtc("2027-01-15", "23:59", "America/Chicago").toISOString()).toBe(
      "2027-01-16T05:59:00.000Z",
    );
    expect(zonedTimeToUtc("2027-07-15", "23:59", "America/Chicago").toISOString()).toBe(
      "2027-07-16T04:59:00.000Z",
    );
    expect(zonedTimeToUtc("2027-03-01", "09:00", "Asia/Kolkata").toISOString()).toBe(
      "2027-03-01T03:30:00.000Z",
    );
    expect(zonedTimeToUtc("2027-03-01", "09:00", "UTC").toISOString()).toBe(
      "2027-03-01T09:00:00.000Z",
    );
  });

  it("moves times in a spring-forward gap to just after it", () => {
    // 2027-03-14 02:30 does not exist in New York.
    expect(zonedTimeToUtc("2027-03-14", "02:30", "America/New_York").toISOString()).toBe(
      "2027-03-14T07:30:00.000Z",
    );
  });

  it("uses the earlier instant for fall-back ambiguous times", () => {
    // 2027-11-07 01:30 happens twice in New York; the first is EDT (UTC-4).
    expect(zonedTimeToUtc("2027-11-07", "01:30", "America/New_York").toISOString()).toBe(
      "2027-11-07T05:30:00.000Z",
    );
  });

  it("round-trips through localDate", () => {
    const instant = zonedTimeToUtc("2027-12-31", "23:30", "Pacific/Auckland");
    expect(localDate(instant, "Pacific/Auckland")).toBe("2027-12-31");
    expect(localDate(instant, "UTC")).toBe("2027-12-31");
    expect(localDate(instant, "America/Los_Angeles")).toBe("2027-12-31");
  });
});

describe("calendar helpers", () => {
  it("adds days across month and year boundaries", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
  });

  it("counts days and weekdays", () => {
    expect(daysBetween("2027-01-12", "2027-05-08")).toBe(116);
    expect(dayOfWeek("2027-01-12")).toBe(2); // Tuesday
  });

  it("reports offsets and local day bounds, including 23-hour DST days", () => {
    expect(offsetMinutes(new Date("2027-01-15T12:00:00Z"), "America/New_York")).toBe(-300);
    const { start, end } = localDayBounds("2027-03-14", "America/New_York");
    expect(start.toISOString()).toBe("2027-03-14T05:00:00.000Z");
    expect((end.getTime() - start.getTime()) / 3_600_000).toBe(23);
  });
});
