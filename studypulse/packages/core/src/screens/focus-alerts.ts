// What happens when a focus timer ends (launch audit L4): a chime, a vibration on phones,
// a notification when the page or app isn't in front, and optional break reminders
// (5 minutes after a session, a longer break after every fourth). Shared by web and
// mobile; the choices are kept on the device, so they're parsed as untrusted input.
import { z } from "zod";

import { localDate } from "../time/index.ts";

export const FOCUS_PREFS_KEY = "studypulse.focus-prefs";

export interface FocusPrefs {
  /** A short chime when the timer ends (web; generated, no audio file). */
  sound: boolean;
  /** Vibrate when the timer ends (phones). */
  vibrate: boolean;
  /** A notification when the timer ends while the page or app is in the background. */
  notify: boolean;
  /** Offer a break after each session. */
  breaks: boolean;
}

export const DEFAULT_FOCUS_PREFS: FocusPrefs = {
  sound: true,
  vibrate: true,
  notify: false,
  breaks: false,
};

const prefsSchema = z.object({
  sound: z.boolean().optional(),
  vibrate: z.boolean().optional(),
  notify: z.boolean().optional(),
  breaks: z.boolean().optional(),
});

/** Stored choices over the defaults; anything unreadable falls back to the defaults. */
export function parseFocusPrefs(raw: string | null | undefined): FocusPrefs {
  if (!raw) return DEFAULT_FOCUS_PREFS;
  try {
    const parsed = prefsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? { ...DEFAULT_FOCUS_PREFS, ...parsed.data } : DEFAULT_FOCUS_PREFS;
  } catch {
    return DEFAULT_FOCUS_PREFS;
  }
}

/** Sessions shorter than this don't earn a break. */
export const BREAK_MIN_SESSION = 20;
export const SHORT_BREAK = 5;
export const LONG_BREAK = 15;
/** A longer break after every this many sessions in a day. */
export const LONG_BREAK_EVERY = 4;

/**
 * The break to offer after a session that just ended, or null for none. `sessionsToday`
 * counts the finished sessions of at least BREAK_MIN_SESSION minutes today, including
 * this one.
 */
export function breakAfter(
  studiedMinutes: number,
  sessionsToday: number,
): { minutes: number; long: boolean } | null {
  if (studiedMinutes < BREAK_MIN_SESSION) return null;
  const long = sessionsToday > 0 && sessionsToday % LONG_BREAK_EVERY === 0;
  return { minutes: long ? LONG_BREAK : SHORT_BREAK, long };
}

/** Finished sessions today (student's timezone) that were long enough to count. */
export function sessionsToday(
  history: readonly { started_at: string; minutes: number }[],
  today: string,
  timeZone: string,
): number {
  return history.filter(
    (s) => s.minutes >= BREAK_MIN_SESSION && localDate(new Date(s.started_at), timeZone) === today,
  ).length;
}

/**
 * The chime: two soft sine notes (a rising major third), generated at play time, so
 * there is no audio file to license. Frequencies in Hz, times in seconds.
 */
export const CHIME = [
  { frequency: 659.25, start: 0, duration: 0.35 },
  { frequency: 830.61, start: 0.18, duration: 0.6 },
] as const;
export const CHIME_VOLUME = 0.2;

/** Vibration when the timer ends: buzz, pause, buzz (milliseconds). */
export const END_VIBRATION = [0, 250, 150, 250] as const;

export const alertText = {
  finishedTitle: "Focus session finished",
  finishedBody: (title: string, minutes: number) =>
    `${String(minutes)} ${minutes === 1 ? "minute" : "minutes"} on ${title}.`,
  breakOffer: (b: { minutes: number; long: boolean }) =>
    b.long
      ? `Nice work: that's four sessions. Take a longer break, ${String(b.minutes)} minutes.`
      : `Take a ${String(b.minutes)}-minute break.`,
  breakOver: "Break's over. Ready for the next session?",
};
