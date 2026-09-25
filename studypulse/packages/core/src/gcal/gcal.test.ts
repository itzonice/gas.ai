import { describe, expect, it } from "vitest";

import {
  blockEvent,
  deadlineEvent,
  diffEvents,
  exchangeGoogleCode,
  GOOGLE_SCOPES,
  GoogleApiError,
  googleAuthorizeUrl,
  googleCalendarApi,
  GoogleOAuthError,
  googleTokenNeedsRefresh,
  hasRequiredScopes,
  mergeBusy,
  refreshGoogleToken,
} from "./index.ts";

interface Call {
  url: string;
  init: RequestInit;
}

function fakeFetch(responses: { status: number; body?: unknown }[]) {
  const calls: Call[] = [];
  const fn = (url: string | URL | Request, init: RequestInit = {}) => {
    calls.push({ url: url instanceof Request ? url.url : url.toString(), init });
    const r = responses.shift() ?? { status: 500 };
    return Promise.resolve(
      new Response(r.body === undefined ? null : JSON.stringify(r.body), { status: r.status }),
    );
  };
  return { fetch: fn, calls };
}

const client = { clientId: "cid", clientSecret: "secret" };
const now = new Date("2027-03-01T15:00:00Z");

describe("Google OAuth", () => {
  it("asks for offline access with only the narrow calendar scopes", () => {
    const url = new URL(
      googleAuthorizeUrl({ clientId: "cid", redirectUri: "https://x.test/cb", state: "s" }),
    );
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("scope")?.split(" ")).toEqual([...GOOGLE_SCOPES]);
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("state")).toBe("s");
  });

  it("exchanges a code for tokens", async () => {
    const f = fakeFetch([
      {
        status: 200,
        body: {
          access_token: "at",
          refresh_token: "rt",
          expires_in: 3599,
          scope: GOOGLE_SCOPES.join(" "),
        },
      },
    ]);
    const t = await exchangeGoogleCode(
      client,
      { code: "c", redirectUri: "https://x.test/cb" },
      { fetch: f.fetch },
      now,
    );
    expect(t).toEqual({
      accessToken: "at",
      refreshToken: "rt",
      expiresAt: new Date(now.getTime() + 3599_000),
      scopes: [...GOOGLE_SCOPES],
    });
    const sent = f.calls[0]?.init.body;
    const body = new URLSearchParams(typeof sent === "string" ? sent : "");
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("client_secret")).toBe("secret");
    expect(hasRequiredScopes(t.scopes)).toBe(true);
    expect(hasRequiredScopes([GOOGLE_SCOPES[0]])).toBe(false);
  });

  it("flags a dead refresh token as needing reauth", async () => {
    const f = fakeFetch([
      { status: 400, body: { error: "invalid_grant", error_description: "Token revoked" } },
    ]);
    const err = await refreshGoogleToken(client, "rt", { fetch: f.fetch }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GoogleOAuthError);
    expect((err as GoogleOAuthError).needsReauth).toBe(true);
    expect(googleTokenNeedsRefresh(new Date(now.getTime() + 60_000), now)).toBe(true);
    expect(googleTokenNeedsRefresh(new Date(now.getTime() + 3600_000), now)).toBe(false);
  });
});

describe("Google Calendar API", () => {
  it("creates calendars and events, and treats deleting a missing event as done", async () => {
    const f = fakeFetch([
      { status: 200, body: { id: "cal@group.calendar.google.com" } },
      { status: 200, body: { id: "evt1" } },
      { status: 410, body: { error: { message: "Resource has been deleted" } } },
      { status: 404, body: { error: { message: "Not Found" } } },
    ]);
    const api = googleCalendarApi("at", { fetch: f.fetch, baseUrl: "https://mock.test/v3" });
    expect(await api.createCalendar("StudyPulse", "America/Chicago")).toBe(
      "cal@group.calendar.google.com",
    );
    const event = blockEvent({
      id: "b1",
      kind: "study",
      status: "planned",
      startsAt: "2027-03-01T22:00:00.000Z",
      endsAt: "2027-03-01T23:00:00.000Z",
      courseLabel: "BIO 201",
      title: "Lab 1",
    }).body;
    expect(await api.insertEvent("cal@group.calendar.google.com", event)).toBe("evt1");
    expect(f.calls[1]?.url).toBe(
      "https://mock.test/v3/calendars/cal%40group.calendar.google.com/events",
    );
    expect(f.calls[1]?.init.headers).toMatchObject({ Authorization: "Bearer at" });
    await expect(api.deleteEvent("cal", "gone")).resolves.toBeUndefined();
    const err = await api.patchEvent("cal", "missing", event).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GoogleApiError);
    expect((err as GoogleApiError).gone).toBe(true);
  });

  it("checks whether the calendar still exists", async () => {
    const f = fakeFetch([
      { status: 200, body: { id: "cal" } },
      { status: 404, body: {} },
    ]);
    const api = googleCalendarApi("at", { fetch: f.fetch });
    expect(await api.calendarExists("cal")).toBe(true);
    expect(await api.calendarExists("deleted")).toBe(false);
  });

  it("reads busy ranges from free/busy", async () => {
    const f = fakeFetch([
      {
        status: 200,
        body: {
          calendars: {
            primary: {
              busy: [{ start: "2027-03-01T17:00:00-06:00", end: "2027-03-01T18:30:00-06:00" }],
            },
          },
        },
      },
    ]);
    const api = googleCalendarApi("at", { fetch: f.fetch });
    expect(await api.freeBusy("2027-03-01T00:00:00Z", "2027-03-02T00:00:00Z", ["primary"])).toEqual(
      [{ startsAt: "2027-03-01T23:00:00.000Z", endsAt: "2027-03-02T00:30:00.000Z" }],
    );
  });
});

describe("sync planning", () => {
  const block = {
    id: "b1",
    kind: "review" as const,
    status: "planned" as const,
    startsAt: "2027-03-01T22:00:00.000Z",
    endsAt: "2027-03-01T23:00:00.000Z",
    courseLabel: "BIO 201",
    title: "Midterm",
  };
  const deadline = {
    id: "a1",
    title: "Essay 2",
    kind: "assignment",
    courseLabel: "HIST 110",
    dueAt: "2027-03-02T05:59:00.000Z",
    localDate: "2027-03-01",
    localTime: "23:59",
  };

  it("builds readable events with a stable key", () => {
    expect(blockEvent(block).body.summary).toBe("Review: Midterm (BIO 201)");
    expect(blockEvent({ ...block, kind: "practice_quiz", title: null }).body.summary).toBe(
      "Closed-note practice quiz (BIO 201)",
    );
    expect(blockEvent({ ...block, status: "done" }).body.summary).toBe(
      "✓ Review: Midterm (BIO 201)",
    );
    const due = deadlineEvent(deadline);
    expect(due.body.summary).toBe("Due 11:59 PM: Essay 2 (HIST 110)");
    expect(due.body.start).toEqual({ date: "2027-03-01" });
    expect(due.body.end).toEqual({ date: "2027-03-02" });
    expect(due.body.transparency).toBe("transparent");
    expect(due.body.extendedProperties.private.studypulseKey).toBe("due:a1");
  });

  it("creates new events, patches changed ones, and removes stale ones", () => {
    const a = blockEvent(block);
    const b = deadlineEvent(deadline);
    const moved = blockEvent({ ...block, startsAt: "2027-03-01T21:00:00.000Z" });
    expect(
      diffEvents(
        [moved, b],
        [
          { key: a.key, eventId: "e1", hash: a.hash },
          { key: "block:old", eventId: "e9", hash: "x" },
        ],
      ),
    ).toEqual({
      create: [b],
      update: [{ eventId: "e1", event: moved }],
      remove: [{ key: "block:old", eventId: "e9" }],
    });
    expect(diffEvents([a], [{ key: a.key, eventId: "e1", hash: a.hash }])).toEqual({
      create: [],
      update: [],
      remove: [],
    });
  });

  it("merges overlapping busy ranges", () => {
    expect(
      mergeBusy([
        { startsAt: "2027-03-01T18:00:00.000Z", endsAt: "2027-03-01T19:00:00.000Z" },
        { startsAt: "2027-03-01T15:00:00.000Z", endsAt: "2027-03-01T16:00:00.000Z" },
        { startsAt: "2027-03-01T18:30:00.000Z", endsAt: "2027-03-01T20:00:00.000Z" },
        { startsAt: "2027-03-01T21:00:00.000Z", endsAt: "2027-03-01T21:00:00.000Z" },
      ]),
    ).toEqual([
      { startsAt: "2027-03-01T15:00:00.000Z", endsAt: "2027-03-01T16:00:00.000Z" },
      { startsAt: "2027-03-01T18:00:00.000Z", endsAt: "2027-03-01T20:00:00.000Z" },
    ]);
  });
});
