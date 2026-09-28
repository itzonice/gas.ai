import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { ageInYears, birthYearOptions, isOldEnough, stillBlocked, toBirthMonth } from "./age.ts";

const on = (iso: string) => new Date(`${iso}T12:00:00Z`);

describe("age gate", () => {
  it("counts the birthday as the last day of the birth month (matches SQL)", () => {
    expect(ageInYears("2013-06", on("2026-06-30"))).toBe(13);
    expect(ageInYears("2013-06", on("2026-06-29"))).toBe(12);
    expect(ageInYears("2013-02", on("2026-02-28"))).toBe(13);
    expect(ageInYears("2013-02", on("2026-02-27"))).toBe(12);
    // Leap year: born "February 2012" counts as the 29th, so the 28th isn't enough.
    expect(ageInYears("2012-02", on("2025-02-28"))).toBe(12);
    expect(ageInYears("2012-02", on("2025-03-01"))).toBe(13);
  });

  it("rejects invalid or future months", () => {
    expect(ageInYears("2013-13", on("2026-01-01"))).toBeNull();
    expect(ageInYears("13-06", on("2026-01-01"))).toBeNull();
    expect(ageInYears("2030-01", on("2026-01-01"))).toBeNull();
  });

  it("never lets someone under 13 through, whatever the day", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1950, max: 2030 }),
        fc.integer({ min: 1, max: 12 }),
        fc.date({ min: new Date("2020-01-01"), max: new Date("2035-12-31"), noInvalidDate: true }),
        (year, month, today) => {
          const bm = toBirthMonth(year, month)!;
          if (!isOldEnough(bm, today)) return true;
          // Even the earliest possible birthday in that month is 13+ years before today.
          const earliest = Date.UTC(year + 13, month - 1, 1);
          return earliest <= today.getTime();
        },
      ),
    );
  });

  it("builds birth months and year choices", () => {
    expect(toBirthMonth(2004, 5)).toBe("2004-05");
    expect(toBirthMonth(2004, 13)).toBeNull();
    const years = birthYearOptions(on("2026-09-25"));
    expect(years[0]).toBe(2026);
    expect(years).toHaveLength(100);
  });

  it("remembers a blocked attempt for a day", () => {
    const now = 1_000_000_000;
    expect(stillBlocked(now - 1000, now)).toBe(true);
    expect(stillBlocked(now - 25 * 3600_000, now)).toBe(false);
    expect(stillBlocked(null, now)).toBe(false);
  });
});
