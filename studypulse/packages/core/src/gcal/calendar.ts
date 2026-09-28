// Minimal Google Calendar API v3 client for the sync: create the dedicated calendar,
// insert/patch/delete its events, and query free/busy. fetch-based, zod-checked.
import { z } from "zod";

export const GOOGLE_API_BASE = "https://www.googleapis.com/calendar/v3";

export class GoogleApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(`Google Calendar ${String(status)}: ${message}`);
    this.name = "GoogleApiError";
    this.status = status;
  }

  /** The event or calendar is gone (deleted by the user in Google Calendar). */
  get gone(): boolean {
    return this.status === 404 || this.status === 410;
  }
}

export interface GoogleEventBody {
  summary: string;
  description?: string;
  start: { dateTime: string } | { date: string };
  end: { dateTime: string } | { date: string };
  /** "transparent" doesn't block the user's time in Google's own free/busy. */
  transparency: "opaque" | "transparent";
  extendedProperties: { private: { studypulseKey: string } };
  reminders: { useDefault: boolean };
}

export interface GoogleCalendarApi {
  createCalendar(summary: string, timeZone: string): Promise<string>;
  /** Whether the calendar still exists (the student may have deleted it). */
  calendarExists(calendarId: string): Promise<boolean>;
  insertEvent(calendarId: string, event: GoogleEventBody): Promise<string>;
  patchEvent(calendarId: string, eventId: string, event: GoogleEventBody): Promise<void>;
  /** Deleting an event that's already gone succeeds. */
  deleteEvent(calendarId: string, eventId: string): Promise<void>;
  freeBusy(timeMin: string, timeMax: string, calendarIds: readonly string[]): Promise<BusyRange[]>;
}

export interface BusyRange {
  startsAt: string;
  endsAt: string;
}

const idSchema = z.looseObject({ id: z.string().min(1) });
const freeBusySchema = z.looseObject({
  calendars: z.record(
    z.string(),
    z.looseObject({
      busy: z.array(z.looseObject({ start: z.string(), end: z.string() })).default([]),
      errors: z.array(z.looseObject({ reason: z.string() })).optional(),
    }),
  ),
});
const errorSchema = z.looseObject({
  error: z.looseObject({ message: z.string().optional() }).optional(),
});

export function googleCalendarApi(
  accessToken: string,
  options: { baseUrl?: string; fetch?: typeof fetch } = {},
): GoogleCalendarApi {
  const base = (options.baseUrl ?? GOOGLE_API_BASE).replace(/\/+$/, "");
  const doFetch = options.fetch ?? fetch;

  async function call(method: string, path: string, body?: unknown): Promise<unknown> {
    const res = await doFetch(`${base}${path}`, {
      method,
      redirect: "error",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (res.status === 204) return null;
    const json: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const e = errorSchema.safeParse(json);
      throw new GoogleApiError(
        res.status,
        (e.success ? e.data.error?.message : undefined) ?? res.statusText,
      );
    }
    return json;
  }

  const enc = encodeURIComponent;
  return {
    async createCalendar(summary, timeZone) {
      const json = await call("POST", "/calendars", {
        summary,
        timeZone,
        description: "Study blocks and deadlines from StudyPulse. Changes here are overwritten.",
      });
      return idSchema.parse(json).id;
    },
    async calendarExists(calendarId) {
      try {
        await call("GET", `/calendars/${enc(calendarId)}`);
        return true;
      } catch (err) {
        if (err instanceof GoogleApiError && err.gone) return false;
        throw err;
      }
    },
    async insertEvent(calendarId, event) {
      const json = await call("POST", `/calendars/${enc(calendarId)}/events`, event);
      return idSchema.parse(json).id;
    },
    async patchEvent(calendarId, eventId, event) {
      await call("PATCH", `/calendars/${enc(calendarId)}/events/${enc(eventId)}`, event);
    },
    async deleteEvent(calendarId, eventId) {
      try {
        await call("DELETE", `/calendars/${enc(calendarId)}/events/${enc(eventId)}`);
      } catch (err) {
        if (err instanceof GoogleApiError && err.gone) return;
        throw err;
      }
    },
    async freeBusy(timeMin, timeMax, calendarIds) {
      const json = await call("POST", "/freeBusy", {
        timeMin,
        timeMax,
        items: calendarIds.map((id) => ({ id })),
      });
      const parsed = freeBusySchema.parse(json);
      return Object.values(parsed.calendars).flatMap((c) =>
        c.busy.map((b) => ({
          startsAt: new Date(b.start).toISOString(),
          endsAt: new Date(b.end).toISOString(),
        })),
      );
    },
  };
}
