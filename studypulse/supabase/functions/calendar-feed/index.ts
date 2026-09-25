// GET /calendar-feed/<token>.ics   (or ?token=<token>)
// A user's deadlines and planned study blocks as an iCalendar feed that calendar apps
// subscribe to. Calendar apps can't send auth headers, so the secret token in the URL
// is the credential: only its SHA-256 hash is stored, looked up with the service role.
import { encodeHex } from "jsr:@std/encoding@^1/hex";
import { z } from "zod";
import { DEADLINE_EVENT_MINUTES, renderIcs, type IcsEvent } from "@studypulse/core/ics/index.ts";

import { createHandler } from "../_shared/handler.ts";
import { HttpError, parseQuery, requireMethod } from "../_shared/http.ts";
import { enforce } from "../_shared/rate-limit.ts";
import { adminClient } from "../_shared/supabase.ts";

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const PAST_DAYS = 30;
const FUTURE_DAYS = 180;

async function sha256Hex(value: string): Promise<string> {
  return encodeHex(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))),
  );
}

const tokenSchema = z.string().regex(TOKEN_RE);
const querySchema = z.object({ token: tokenSchema.optional() });

/** The token from ?token=… or the last path segment (…/<token>.ics). */
function tokenFrom(req: Request): string | null {
  const query = parseQuery(req, querySchema);
  if (!query) return null;
  const last = new URL(req.url).pathname.split("/").filter(Boolean).at(-1) ?? "";
  const token = tokenSchema.safeParse(query.token ?? last.replace(/\.ics$/, ""));
  return token.success ? token.data : null;
}

Deno.serve(
  createHandler("calendar-feed", async (req, { log }) => {
    requireMethod(req, "GET", "HEAD");
    const token = tokenFrom(req);
    // Same response for malformed and unknown tokens.
    const notFound = new HttpError(404, "not_found", "Calendar not found");
    if (!token) throw notFound;

    // Calendar apps poll every 15 minutes to a few hours; 60 an hour per token is plenty.
    const tokenHash = await sha256Hex(token);
    await enforce(`ics:${tokenHash.slice(0, 32)}`, { limit: 60, windowSeconds: 3600 }, log);

    const db = adminClient();
    const { data: profile } = await db
      .from("profiles")
      .select("id")
      .eq("calendar_token_hash", tokenHash)
      .maybeSingle();
    if (!profile) throw notFound;

    const now = new Date();
    const from = new Date(now.getTime() - PAST_DAYS * 86_400_000).toISOString();
    const to = new Date(now.getTime() + FUTURE_DAYS * 86_400_000).toISOString();

    // Every query is filtered to this user explicitly (service role bypasses RLS).
    const [assignments, blocks] = await Promise.all([
      db
        .from("assignments")
        .select(
          "id, title, kind, status, due_at, updated_at, courses!inner(user_id, name, code, archived_at)",
        )
        .eq("courses.user_id", profile.id)
        .is("courses.archived_at", null)
        .neq("status", "skipped")
        .gte("due_at", from)
        .lte("due_at", to),
      db
        .from("study_blocks")
        .select(
          "id, starts_at, ends_at, kind, status, updated_at, assignments(title), courses!inner(name, code)",
        )
        .eq("user_id", profile.id)
        .eq("status", "planned")
        .gte("starts_at", from)
        .lte("starts_at", to),
    ]);
    if (assignments.error) throw assignments.error;
    if (blocks.error) throw blocks.error;

    const events: IcsEvent[] = [];
    for (const a of assignments.data) {
      if (!a.due_at) continue;
      const course = a.courses.code ?? a.courses.name;
      const due = new Date(a.due_at);
      events.push({
        uid: `assignment-${a.id}@studypulse`,
        start: new Date(due.getTime() - DEADLINE_EVENT_MINUTES * 60_000),
        end: due,
        summary: `${a.status === "done" ? "✓ " : ""}Due: ${a.title} (${course})`,
        categories: [course, a.kind],
        lastModified: new Date(a.updated_at),
      });
    }
    for (const b of blocks.data) {
      const course = b.courses.code ?? b.courses.name;
      const label = b.kind === "review" ? "Review" : b.kind === "exam_prep" ? "Exam prep" : "Study";
      events.push({
        uid: `block-${b.id}@studypulse`,
        start: new Date(b.starts_at),
        end: new Date(b.ends_at),
        summary: `${label}: ${b.assignments?.title ?? course} (${course})`,
        categories: [course, "study"],
        lastModified: new Date(b.updated_at),
      });
    }

    const body = renderIcs({ name: "StudyPulse", refreshMinutes: 60, events, now });
    return new Response(req.method === "HEAD" ? null : body, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'inline; filename="studypulse.ics"',
        "Cache-Control": "private, max-age=900",
      },
    });
  }),
);
