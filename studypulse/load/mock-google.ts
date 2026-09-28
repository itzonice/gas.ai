// Mock Google OAuth + Calendar API v3 for local end-to-end checks of Google Calendar
// sync (never talks to Google). Run: deno run --allow-net --allow-env load/mock-google.ts
// Then set GOOGLE_OAUTH_BASE_URL=http://127.0.0.1:8198/oauth and
// GOOGLE_API_BASE_URL=http://127.0.0.1:8198/v3 for the functions.
// Busy time: tomorrow 21:00-23:00 UTC. GET /__state shows what was pushed.
const port = Number(Deno.env.get("MOCK_GOOGLE_PORT") ?? 8198);
const SCOPES =
  "https://www.googleapis.com/auth/calendar.app.created https://www.googleapis.com/auth/calendar.freebusy";

const calendars = new Map<string, Map<string, unknown>>();
let nextId = 1;
let refreshes = 0;
let revoked = 0;

function tomorrowAt(hourUtc: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCHours(hourUtc, 0, 0, 0);
  return d.toISOString();
}

Deno.serve({ port }, async (req) => {
  const url = new URL(req.url);
  const path = url.pathname;
  if (path === "/__state") {
    return Response.json({
      calendars: Object.fromEntries([...calendars].map(([id, ev]) => [id, [...ev.values()]])),
      refreshes,
      revoked,
    });
  }
  if (path === "/oauth/token") {
    const form = new URLSearchParams(await req.text());
    if (form.get("grant_type") === "authorization_code") {
      if (form.get("code") !== "good")
        return Response.json({ error: "invalid_grant" }, { status: 400 });
      return Response.json({
        access_token: "at-1",
        refresh_token: "rt-1",
        expires_in: 3600,
        scope: SCOPES,
      });
    }
    refreshes++;
    return Response.json({ access_token: `at-r${refreshes}`, expires_in: 3600, scope: SCOPES });
  }
  if (path === "/oauth/revoke") {
    revoked++;
    return new Response(null, { status: 200 });
  }
  if (req.headers.get("authorization")?.startsWith("Bearer at-") !== true) {
    return Response.json({ error: { message: "Invalid Credentials" } }, { status: 401 });
  }
  if (path === "/v3/calendars" && req.method === "POST") {
    const id = `studypulse-${nextId++}@group.calendar.google.com`;
    calendars.set(id, new Map());
    return Response.json({ id });
  }
  if (path === "/v3/freeBusy" && req.method === "POST") {
    return Response.json({
      calendars: { primary: { busy: [{ start: tomorrowAt(21), end: tomorrowAt(23) }] } },
    });
  }
  const calendar = path.match(/^\/v3\/calendars\/([^/]+)$/);
  if (calendar && req.method === "GET") {
    const id = decodeURIComponent(calendar[1] ?? "");
    return calendars.has(id)
      ? Response.json({ id })
      : Response.json({ error: { message: "Not Found" } }, { status: 404 });
  }
  const m = path.match(/^\/v3\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/);
  if (m) {
    const cal = calendars.get(decodeURIComponent(m[1] ?? ""));
    if (!cal) return Response.json({ error: { message: "Not Found" } }, { status: 404 });
    const eventId = m[2] ? decodeURIComponent(m[2]) : null;
    if (req.method === "POST" && !eventId) {
      const id = `evt${nextId++}`;
      cal.set(id, { id, ...(await req.json()) });
      return Response.json({ id });
    }
    if (eventId && !cal.has(eventId)) {
      return Response.json({ error: { message: "Not Found" } }, { status: 404 });
    }
    if (req.method === "PATCH" && eventId) {
      cal.set(eventId, { id: eventId, ...(await req.json()) });
      return Response.json({ id: eventId });
    }
    if (req.method === "DELETE" && eventId) {
      cal.delete(eventId);
      return new Response(null, { status: 204 });
    }
  }
  return Response.json({ error: { message: `no route ${req.method} ${path}` } }, { status: 404 });
});
