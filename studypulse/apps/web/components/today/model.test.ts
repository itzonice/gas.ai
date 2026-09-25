import { describe, expect, it } from "vitest";

import {
  atRiskStatus,
  dueText,
  examCountdown,
  focusHours,
  formatMinutes,
  taskMeta,
  timeRange,
} from "./model";

describe("Today formatting", () => {
  it("shows focus hours with at most one decimal", () => {
    expect(focusHours(0)).toBe("0");
    expect(focusHours(95)).toBe("1.6");
    expect(focusHours(120)).toBe("2");
  });

  it("names the at-risk courses in words", () => {
    expect(atRiskStatus([])).toBeUndefined();
    expect(
      atRiskStatus([
        { id: "a", code: "BIO 201", current: 70, target: 90 },
        { id: "b", code: "CHEM 230", current: 75, target: 80 },
      ]),
    ).toEqual({ tone: "error", text: "At risk: BIO 201, CHEM 230" });
  });

  it("formats due times in the user's timezone", () => {
    const now = new Date("2027-03-01T15:00:00Z"); // 9:00 AM in Chicago
    expect(dueText("2027-03-02T05:59:00Z", "America/Chicago", now)).toBe("Due today at 11:59 PM");
    expect(dueText(null, "America/Chicago", now)).toBe("No due date");
  });

  it("builds task metadata from the parts that apply", () => {
    expect(taskMeta({ grade_share: 20, minutes_remaining: 45 })).toBe("Worth 20% · 45 min left");
    expect(taskMeta({ grade_share: 2.5, minutes_remaining: 90 })).toBe(
      "Worth 2.5% · 1 h 30 min left",
    );
    expect(taskMeta({ grade_share: 0, minutes_remaining: 0 })).toBe("");
    expect(formatMinutes(120)).toBe("2 h");
  });

  it("formats time ranges and exam countdowns", () => {
    expect(timeRange("2027-03-01T21:00:00Z", "2027-03-01T21:30:00Z", "America/Chicago")).toMatch(
      /^3:00\s?–\s?3:30\sPM$/,
    );
    expect(examCountdown(0)).toBe("Today");
    expect(examCountdown(1)).toBe("Tomorrow");
    expect(examCountdown(12)).toBe("In 12 days");
  });
});
