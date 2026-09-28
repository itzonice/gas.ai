import { describe, expect, it } from "vitest";

import {
  alertText,
  breakAfter,
  DEFAULT_FOCUS_PREFS,
  parseFocusPrefs,
  sessionsToday,
} from "./focus-alerts.ts";

describe("focus alerts", () => {
  it("reads stored choices over the defaults and ignores junk", () => {
    expect(parseFocusPrefs(null)).toEqual(DEFAULT_FOCUS_PREFS);
    expect(parseFocusPrefs('{"breaks":true,"sound":false}')).toEqual({
      ...DEFAULT_FOCUS_PREFS,
      breaks: true,
      sound: false,
    });
    expect(parseFocusPrefs('{"breaks":"yes"}')).toEqual(DEFAULT_FOCUS_PREFS);
    expect(parseFocusPrefs("not json")).toEqual(DEFAULT_FOCUS_PREFS);
  });

  it("offers 5 minutes after a session and 15 after every fourth", () => {
    expect(breakAfter(25, 1)).toEqual({ minutes: 5, long: false });
    expect(breakAfter(25, 3)).toEqual({ minutes: 5, long: false });
    expect(breakAfter(25, 4)).toEqual({ minutes: 15, long: true });
    expect(breakAfter(50, 8)).toEqual({ minutes: 15, long: true });
  });

  it("offers no break after a short session", () => {
    expect(breakAfter(10, 4)).toBeNull();
  });

  it("counts today's long-enough sessions in the student's timezone", () => {
    const history = [
      { started_at: "2027-03-02T04:30:00Z", minutes: 25 }, // Mar 1, 10:30 PM in Chicago
      { started_at: "2027-03-02T15:00:00Z", minutes: 25 },
      { started_at: "2027-03-02T16:00:00Z", minutes: 10 },
      { started_at: "2027-03-02T17:00:00Z", minutes: 45 },
    ];
    expect(sessionsToday(history, "2027-03-02", "America/Chicago")).toBe(2);
  });

  it("words the break and finish messages", () => {
    expect(alertText.breakOffer({ minutes: 5, long: false })).toBe("Take a 5-minute break.");
    expect(alertText.finishedBody("Lab 3", 1)).toBe("1 minute on Lab 3.");
  });
});
