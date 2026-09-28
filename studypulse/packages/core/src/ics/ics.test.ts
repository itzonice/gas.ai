import { describe, expect, it } from "vitest";

import { calendarFeedUrl, escapeText, foldLine, icsDate, renderIcs } from "./index.ts";

describe("ics", () => {
  it("formats UTC dates", () => {
    expect(icsDate(new Date("2027-03-01T15:04:05.678Z"))).toBe("20270301T150405Z");
  });

  it("escapes text", () => {
    expect(escapeText("Lab 1; part A, B\\C\nnext")).toBe(String.raw`Lab 1\; part A\, B\\C\nnext`);
  });

  it("folds long lines at 75 octets without splitting characters", () => {
    const folded = foldLine(`SUMMARY:${"é".repeat(60)}`);
    const lines = folded.split("\r\n");
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(lines.slice(1).every((l) => l.startsWith(" "))).toBe(true);
    expect(lines.map((l, i) => (i === 0 ? l : l.slice(1))).join("")).toBe(
      `SUMMARY:${"é".repeat(60)}`,
    );
  });

  it("renders a calendar with CRLF line endings and stable UIDs", () => {
    const ics = renderIcs({
      name: "StudyPulse",
      now: new Date("2027-03-01T00:00:00Z"),
      events: [
        {
          uid: "a1@studypulse",
          start: new Date("2027-03-04T15:30:00Z"),
          end: new Date("2027-03-04T16:00:00Z"),
          summary: "Due: Midterm, BIO 201",
          categories: ["BIO 201"],
        },
      ],
    });
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).not.toMatch(/[^\r]\n/);
    expect(ics).toContain(
      "UID:a1@studypulse\r\nDTSTAMP:20270301T000000Z\r\nDTSTART:20270304T153000Z\r\nDTEND:20270304T160000Z\r\nSUMMARY:Due: Midterm\\, BIO 201",
    );
  });

  it("builds webcal and https subscribe URLs", () => {
    expect(calendarFeedUrl("https://abc.supabase.co/", "tok")).toBe(
      "webcal://abc.supabase.co/functions/v1/calendar-feed/tok.ics",
    );
    expect(calendarFeedUrl("https://abc.supabase.co", "tok", { webcal: false })).toBe(
      "https://abc.supabase.co/functions/v1/calendar-feed/tok.ics",
    );
  });
});
