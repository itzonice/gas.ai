// Timezone helpers. Instants are stored in UTC; local calendar dates and wall-clock
// times are always interpreted in the user's IANA timezone (profiles.timezone).
// Implemented with Intl only, so it works the same in Node, Deno, browsers, and RN.

export type IsoDate = string; // YYYY-MM-DD
export type LocalTime = string; // HH:MM (24h)

const partsFormatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = partsFormatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    partsFormatters.set(timeZone, f);
  }
  return f;
}

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** Wall-clock fields of an instant in a timezone. */
export function zonedParts(instant: Date, timeZone: string): ZonedParts {
  const out: Record<string, number> = {};
  for (const part of formatter(timeZone).formatToParts(instant)) {
    if (part.type !== "literal") out[part.type] = Number(part.value);
  }
  return {
    year: out.year ?? 0,
    month: out.month ?? 0,
    day: out.day ?? 0,
    hour: out.hour ?? 0,
    minute: out.minute ?? 0,
    second: out.second ?? 0,
  };
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/** The local calendar date (YYYY-MM-DD) of an instant in a timezone. */
export function localDate(instant: Date, timeZone: string): IsoDate {
  const p = zonedParts(instant, timeZone);
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`;
}

/** Offset of the timezone from UTC at an instant, in minutes (e.g. -300 for EST). */
export function offsetMinutes(instant: Date, timeZone: string): number {
  const p = zonedParts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60000);
}

/**
 * The UTC instant for a local wall-clock time. DST gaps (e.g. 02:30 on spring-forward
 * day) resolve forward to the first valid time; ambiguous times (fall-back) resolve to
 * the earlier occurrence.
 */
export function zonedTimeToUtc(date: IsoDate, time: LocalTime, timeZone: string): Date {
  const [y = 0, mo = 1, d = 1] = date.split("-").map(Number);
  const [h = 0, mi = 0] = time.split(":").map(Number);
  const wallAsUtc = Date.UTC(y, mo - 1, d, h, mi);
  // Try the offsets in effect a day either side; one of them matches unless the
  // wall time falls in a DST gap.
  const candidates = [
    offsetMinutes(new Date(wallAsUtc - 86_400_000), timeZone),
    offsetMinutes(new Date(wallAsUtc + 86_400_000), timeZone),
  ];
  const matches = candidates
    .map((off) => new Date(wallAsUtc - off * 60_000))
    .filter((instant) => {
      const p = zonedParts(instant, timeZone);
      return p.year === y && p.month === mo && p.day === d && p.hour === h && p.minute === mi;
    })
    .sort((a, b) => a.getTime() - b.getTime());
  if (matches[0]) return matches[0];
  // DST gap: the wall time doesn't exist. Use the pre-transition offset, which lands
  // just after the gap (e.g. 02:30 -> 03:30).
  return new Date(wallAsUtc - Math.min(...candidates) * 60_000);
}

/** Adds whole days to a calendar date. */
export function addDays(date: IsoDate, days: number): IsoDate {
  const [y = 0, m = 1, d = 1] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${pad(t.getUTCFullYear(), 4)}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** Whole days from a to b (b - a) between calendar dates. */
export function daysBetween(a: IsoDate, b: IsoDate): number {
  const toUtc = (s: IsoDate) => {
    const [y = 0, m = 1, d = 1] = s.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}

/** Day of week for a calendar date: 0 = Sunday ... 6 = Saturday. */
export function dayOfWeek(date: IsoDate): number {
  const [y = 0, m = 1, d = 1] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** UTC bounds of a local calendar day: [start, end). */
export function localDayBounds(date: IsoDate, timeZone: string): { start: Date; end: Date } {
  return {
    start: zonedTimeToUtc(date, "00:00", timeZone),
    end: zonedTimeToUtc(addDays(date, 1), "00:00", timeZone),
  };
}
