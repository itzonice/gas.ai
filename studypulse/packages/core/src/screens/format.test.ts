import { describe, expect, it } from "vitest";

import { formatRange } from "./format.ts";

const fmt = () =>
  new Intl.DateTimeFormat("en-US", { timeZone: "UTC", hour: "numeric", minute: "2-digit" });
const start = new Date("2026-10-01T15:00:00Z");
const end = new Date("2026-10-01T15:30:00Z");

describe("formatRange", () => {
  it("uses Intl formatRange when the engine has it", () => {
    expect(formatRange(fmt(), start, end)).toBe(fmt().formatRange(start, end));
  });

  it("falls back to both ends and a dash when it doesn't (Hermes)", () => {
    const f = fmt();
    Object.defineProperty(f, "formatRange", { value: undefined });
    expect(formatRange(f, start, end)).toBe("3:00 PM – 3:30 PM");
  });
});
