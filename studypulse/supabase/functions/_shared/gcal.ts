// Google Calendar sync for one user: pull busy times (and replan if they changed), then
// push study blocks and deadlines to the dedicated StudyPulse calendar.
import type { Logger } from "@studypulse/core/observability/index.ts";
import {
  blockEvent,
  deadlineEvent,
  diffEvents,
  GoogleApiError,
  googleCalendarApi,
  GoogleOAuthError,
  googleTokenNeedsRefresh,
  mergeBusy,
  refreshGoogleToken,
  type DesiredEvent,
  type GoogleCalendarApi,
  type GoogleClient,
  type GoogleEndpoints,
} from "@studypulse/core/gcal/index.ts";
import { addDays, localDate, zonedParts, zonedTimeToUtc } from "@studypulse/core/time/index.ts";

import { env } from "./env.ts";
import { HttpError } from "./http.ts";
import { providerFetch } from "./resilience.ts";
import { PLAN_HORIZON_DAYS, replanUser } from "./planner.ts";
import type { AdminClient } from "./supabase.ts";

/** Days of deadlines to show on the calendar. */
export const DEADLINE_DAYS = 60;

export interface GoogleConfig {
  client: GoogleClient;
  endpoints: GoogleEndpoints;
  apiBaseUrl: string | undefined;
  redirectUri: string;
}

/** The app's Google client, or null when sync isn't configured. */
export function googleConfig(): GoogleConfig | null {
  const e = env();
  if (!e.GOOGLE_CLIENT_ID || !e.GOOGLE_CLIENT_SECRET) return null;
  const base = e.GOOGLE_OAUTH_BASE_URL?.replace(/\/+$/, "");
  return {
    client: { clientId: e.GOOGLE_CLIENT_ID, clientSecret: e.GOOGLE_CLIENT_SECRET },
    endpoints: {
      ...(base
        ? { authUrl: `${base}/auth`, tokenUrl: `${base}/token`, revokeUrl: `${base}/revoke` }
        : {}),
      fetch: providerFetch("google"),
    },
    apiBaseUrl: e.GOOGLE_API_BASE_URL,
    redirectUri: e.GOOGLE_REDIRECT_URI ?? `${e.SUPABASE_URL}/functions/v1/google-oauth/callback`,
  };
}

export function requireGoogleConfig(): GoogleConfig {
  const config = googleConfig();
  if (!config) {
    throw new HttpError(503, "google_not_configured", "Google Calendar sync isn't available yet.");
  }
  return config;
}

interface Session {
  api: GoogleCalendarApi;
  accessToken: string;
  calendarId: string | null;
  pushEnabled: boolean;
  readBusy: boolean;
  timezone: string;
}

async function session(db: AdminClient, userId: string, config: GoogleConfig): Promise<Session> {
  const { data, error } = await db.rpc("gcal_credentials", { p_user_id: userId });
  if (error) throw error;
  const c = data[0];
  if (!c?.access_token) throw new HttpError(404, "not_connected", "Connect Google Calendar first");
  if (c.status !== "active") {
    throw new HttpError(409, "google_reauth_required", "Reconnect Google Calendar to keep syncing");
  }
  let accessToken = c.access_token;
  const expiresAt = c.access_token_expires_at ? new Date(c.access_token_expires_at) : null;
  if (googleTokenNeedsRefresh(expiresAt)) {
    if (!c.refresh_token) {
      await db.rpc("gcal_mark_needs_reauth", { p_user_id: userId, p_error: "no refresh token" });
      throw new HttpError(
        409,
        "google_reauth_required",
        "Reconnect Google Calendar to keep syncing",
      );
    }
    try {
      const fresh = await refreshGoogleToken(config.client, c.refresh_token, config.endpoints);
      accessToken = fresh.accessToken;
      const { error: saveError } = await db.rpc("gcal_update_tokens", {
        p_user_id: userId,
        p_access_token: fresh.accessToken,
        ...(fresh.expiresAt ? { p_expires_at: fresh.expiresAt.toISOString() } : {}),
        ...(fresh.refreshToken ? { p_refresh_token: fresh.refreshToken } : {}),
      });
      if (saveError) throw saveError;
    } catch (err) {
      if (err instanceof GoogleOAuthError && err.needsReauth) {
        await db.rpc("gcal_mark_needs_reauth", { p_user_id: userId, p_error: err.message });
        throw new HttpError(
          409,
          "google_reauth_required",
          "Reconnect Google Calendar to keep syncing",
        );
      }
      throw err;
    }
  }
  return {
    api: googleCalendarApi(accessToken, {
      ...(config.apiBaseUrl ? { baseUrl: config.apiBaseUrl } : {}),
      fetch: providerFetch("google"),
    }),
    accessToken,
    calendarId: c.calendar_id,
    pushEnabled: c.push_enabled,
    readBusy: c.read_busy,
    timezone: c.timezone,
  };
}

/** The dedicated calendar, created on first use (or again if the student deleted it). */
async function ensureCalendar(db: AdminClient, userId: string, s: Session): Promise<string> {
  if (s.calendarId && (await s.api.calendarExists(s.calendarId))) return s.calendarId;
  const id = await s.api.createCalendar("StudyPulse", s.timezone);
  const { error } = await db.rpc("gcal_set_calendar", { p_user_id: userId, p_calendar_id: id });
  if (error) throw error;
  s.calendarId = id;
  return id;
}

async function desiredEvents(db: AdminClient, userId: string, tz: string, now: Date) {
  const today = localDate(now, tz);
  const from = zonedTimeToUtc(today, "00:00", tz).toISOString();
  const blocksTo = zonedTimeToUtc(addDays(today, PLAN_HORIZON_DAYS + 1), "00:00", tz).toISOString();
  const dueTo = zonedTimeToUtc(addDays(today, DEADLINE_DAYS + 1), "00:00", tz).toISOString();
  const [blocks, deadlines] = await Promise.all([
    db
      .from("study_blocks")
      .select(
        "id, kind, status, starts_at, ends_at, courses!inner(code, name, archived_at), assignments(title)",
      )
      .eq("user_id", userId)
      .is("courses.archived_at", null)
      .in("status", ["planned", "done"])
      .gte("starts_at", from)
      .lt("starts_at", blocksTo),
    db
      .from("assignments")
      .select("id, title, kind, due_at, courses!inner(user_id, code, name, archived_at)")
      .eq("courses.user_id", userId)
      .is("courses.archived_at", null)
      .in("status", ["todo", "in_progress"])
      .neq("source", "study_system")
      .gte("due_at", from)
      .lt("due_at", dueTo),
  ]);
  if (blocks.error) throw blocks.error;
  if (deadlines.error) throw deadlines.error;

  const events: DesiredEvent[] = [];
  for (const b of blocks.data) {
    events.push(
      blockEvent({
        id: b.id,
        kind: b.kind,
        status: b.status as "planned" | "done",
        startsAt: new Date(b.starts_at).toISOString(),
        endsAt: new Date(b.ends_at).toISOString(),
        courseLabel: b.courses.code ?? b.courses.name,
        title: b.assignments?.title ?? null,
      }),
    );
  }
  for (const a of deadlines.data) {
    if (!a.due_at) continue;
    const due = new Date(a.due_at);
    const p = zonedParts(due, tz);
    events.push(
      deadlineEvent({
        id: a.id,
        title: a.title,
        kind: a.kind,
        courseLabel: a.courses.code ?? a.courses.name,
        dueAt: due.toISOString(),
        localDate: localDate(due, tz),
        localTime: `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`,
      }),
    );
  }
  return events;
}

async function push(db: AdminClient, userId: string, s: Session, now: Date) {
  const calendarId = await ensureCalendar(db, userId, s);
  const desired = await desiredEvents(db, userId, s.timezone, now);
  const { data: mapped, error } = await db
    .from("google_calendar_events")
    .select("item_key, event_id, content_hash")
    .eq("user_id", userId);
  if (error) throw error;
  const diff = diffEvents(
    desired,
    mapped.map((m) => ({ key: m.item_key, eventId: m.event_id, hash: m.content_hash })),
  );

  const save = async (key: string, eventId: string, hash: string) => {
    const { error: e } = await db.from("google_calendar_events").upsert({
      user_id: userId,
      item_key: key,
      event_id: eventId,
      content_hash: hash,
      updated_at: new Date().toISOString(),
    });
    if (e) throw e;
  };

  for (const event of diff.create) {
    const id = await s.api.insertEvent(calendarId, event.body);
    await save(event.key, id, event.hash);
  }
  for (const { eventId, event } of diff.update) {
    try {
      await s.api.patchEvent(calendarId, eventId, event.body);
      await save(event.key, eventId, event.hash);
    } catch (err) {
      // Deleted in Google: put it back.
      if (!(err instanceof GoogleApiError && err.gone)) throw err;
      await save(event.key, await s.api.insertEvent(calendarId, event.body), event.hash);
    }
  }
  for (const { key, eventId } of diff.remove) {
    await s.api.deleteEvent(calendarId, eventId);
    const { error: e } = await db
      .from("google_calendar_events")
      .delete()
      .eq("user_id", userId)
      .eq("item_key", key);
    if (e) throw e;
  }
  return { created: diff.create.length, updated: diff.update.length, removed: diff.remove.length };
}

export interface GoogleSyncResult {
  busyRanges: number;
  busyChanged: boolean;
  replanned: boolean;
  created: number;
  updated: number;
  removed: number;
}

export async function syncGoogleUser(
  db: AdminClient,
  userId: string,
  log: Logger,
  now = new Date(),
): Promise<GoogleSyncResult> {
  const config = requireGoogleConfig();
  const s = await session(db, userId, config);
  const result: GoogleSyncResult = {
    busyRanges: 0,
    busyChanged: false,
    replanned: false,
    created: 0,
    updated: 0,
    removed: 0,
  };

  try {
    // 1. Pull: busy time on the student's primary calendar, then replan around it.
    if (s.readBusy) {
      const from = now.toISOString();
      const to = new Date(now.getTime() + (PLAN_HORIZON_DAYS + 1) * 86_400_000).toISOString();
      const busy = mergeBusy(await s.api.freeBusy(from, to, ["primary"]));
      const { data: changed, error } = await db.rpc("gcal_replace_busy", {
        p_user_id: userId,
        p_from: from,
        p_to: to,
        p_busy: busy.map((b) => ({ startsAt: b.startsAt, endsAt: b.endsAt })),
      });
      if (error) throw error;
      result.busyRanges = busy.length;
      result.busyChanged = changed;
      if (changed) {
        await replanUser(db, userId, now, log);
        result.replanned = true;
      }
    }

    // 2. Push: blocks and deadlines to the StudyPulse calendar.
    if (s.pushEnabled) {
      let pushed;
      try {
        pushed = await push(db, userId, s, now);
      } catch (err) {
        // The student deleted the StudyPulse calendar: make a new one and push again.
        if (!(err instanceof GoogleApiError && err.gone && s.calendarId)) throw err;
        log.info("google calendar missing; recreating", { user_id: userId });
        const { error } = await db.rpc("gcal_set_calendar", { p_user_id: userId });
        if (error) throw error;
        s.calendarId = null;
        pushed = await push(db, userId, s, now);
      }
      Object.assign(result, pushed);
    }
  } catch (err) {
    if (err instanceof GoogleApiError && err.status === 401) {
      await db.rpc("gcal_mark_needs_reauth", { p_user_id: userId, p_error: err.message });
      throw new HttpError(
        409,
        "google_reauth_required",
        "Reconnect Google Calendar to keep syncing",
      );
    }
    await db.rpc("gcal_record_sync", {
      p_user_id: userId,
      p_error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  await db.rpc("gcal_record_sync", { p_user_id: userId });
  return result;
}
