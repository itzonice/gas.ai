// Minimal RFC 5545 (iCalendar) writer for the calendar feed.

export interface IcsEvent {
  /** Stable across refreshes so calendar apps update the event instead of duplicating it. */
  uid: string;
  start: Date;
  end: Date;
  summary: string;
  description?: string;
  categories?: string[];
  /** Bumped when the event changes (e.g. the row's updated_at). */
  lastModified?: Date;
}

export interface IcsCalendar {
  name: string;
  /** How often clients should refetch. */
  refreshMinutes?: number;
  events: readonly IcsEvent[];
  now?: Date;
}

/** 20270301T150000Z */
export function icsDate(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

/** Escapes TEXT values: backslash, semicolon, comma, and newlines. */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, String.raw`\;`)
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Folds a content line to at most 75 octets per line (continuations start with a space). */
export function foldLine(line: string): string {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    const limit = parts.length === 0 ? 75 : 74; // continuation lines carry a leading space
    if (bytes + size > limit) {
      parts.push(current);
      current = "";
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

export function renderIcs(calendar: IcsCalendar): string {
  const stamp = icsDate(calendar.now ?? new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//StudyPulse//Calendar Feed//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(calendar.name)}`,
    `REFRESH-INTERVAL;VALUE=DURATION:PT${String(calendar.refreshMinutes ?? 60)}M`,
    `X-PUBLISHED-TTL:PT${String(calendar.refreshMinutes ?? 60)}M`,
  ];
  for (const e of calendar.events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsDate(e.start)}`,
      `DTEND:${icsDate(e.end)}`,
      `SUMMARY:${escapeText(e.summary)}`,
    );
    if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
    if (e.categories?.length) lines.push(`CATEGORIES:${e.categories.map(escapeText).join(",")}`);
    if (e.lastModified) lines.push(`LAST-MODIFIED:${icsDate(e.lastModified)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}

/** Deadlines show as a short event ending at the due time. */
export const DEADLINE_EVENT_MINUTES = 30;

/**
 * The subscribe URL for a feed token. Calendar apps prefer webcal:// (it opens the
 * subscribe dialog); pass `webcal: false` for a plain https link to copy.
 */
export function calendarFeedUrl(
  supabaseUrl: string,
  token: string,
  options: { webcal?: boolean } = {},
): string {
  const url = `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/calendar-feed/${token}.ics`;
  return options.webcal === false ? url : url.replace(/^https?:\/\//, "webcal://");
}
