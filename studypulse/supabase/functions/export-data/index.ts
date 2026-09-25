// GET /export-data
// Everything StudyPulse stores about the caller, as one JSON download. Reads through
// the caller's RLS, so it can only ever contain their own data. Uploaded syllabus files
// are included as signed links valid for 15 minutes.
import { createHandler } from "../_shared/handler.ts";
import { requireMethod } from "../_shared/http.ts";
import { requireUser, userClient } from "../_shared/supabase.ts";

/** Links to the original syllabus files in an export stay valid this long. */
const SIGNED_URL_SECONDS = 15 * 60;

export const EXPORT_FORMAT_VERSION = 1;

Deno.serve(
  createHandler("export-data", async (req) => {
    requireMethod(req, "GET");
    const user = await requireUser(req);
    const db = userClient(req);

    const results = await Promise.all([
      db.from("profiles").select("*").single(),
      db.from("notification_prefs").select("*").maybeSingle(),
      db
        .from("courses")
        .select(
          "*, grade_categories(*), assignments(*, assignment_resources(*)), flashcards(*), course_meetings(*)",
        )
        .order("created_at"),
      db.from("study_sessions").select("*").order("started_at"),
      db.from("study_blocks").select("*").order("starts_at"),
      db.from("syllabus_uploads").select("*").order("created_at"),
      db
        .from("subscriptions")
        .select(
          "provider, product_id, status, current_period_end, cancel_at_period_end, created_at",
        ),
      db
        .from("notification_tokens")
        .select("provider, platform, app_version, last_seen_at, invalidated_at, created_at"),
      db
        .from("notification_log")
        .select("kind, channel, status, title, body, created_at")
        .order("created_at"),
      // Own rows only: an organization admin's RLS also shows their roster.
      db
        .from("organization_memberships")
        .select("role, share_focus_hours, sharing_changed_at, joined_at, organizations(name)")
        .eq("user_id", user.id),
      db
        .from("lms_connections")
        .select(
          "external_user_name, status, connected_at, last_synced_at, lms_institutions(name, base_url)",
        ),
      db
        .from("google_calendar_connections")
        .select("status, push_enabled, read_busy, connected_at, last_synced_at"),
      db.from("external_busy_times").select("source, starts_at, ends_at").order("starts_at"),
      db
        .from("card_generations")
        .select("course_id, status, card_count, notes_chars, created_at")
        .order("created_at"),
    ]);
    for (const r of results) if (r.error) throw r.error;
    const [
      profile,
      prefs,
      courses,
      sessions,
      blocks,
      uploads,
      subscriptions,
      devices,
      notifications,
      organizations,
      lmsConnections,
      googleCalendar,
      busyTimes,
      cardGenerations,
    ] = results;

    const uploadRows = (uploads.data ?? []) as { file_path: string | null }[];
    const withLinks = await Promise.all(
      uploadRows.map(async (u) => {
        if (!u.file_path) return { ...u, file_url: null };
        const { data } = await db.storage
          .from("syllabi")
          .createSignedUrl(u.file_path, SIGNED_URL_SECONDS);
        return { ...u, file_url: data?.signedUrl ?? null };
      }),
    );

    const body = {
      format_version: EXPORT_FORMAT_VERSION,
      generated_at: new Date().toISOString(),
      user: { id: user.id, email: user.email ?? null },
      profile: profile.data,
      notification_prefs: prefs.data,
      courses: courses.data,
      study_sessions: sessions.data,
      study_blocks: blocks.data,
      syllabus_uploads: withLinks,
      subscriptions: subscriptions.data,
      devices: devices.data,
      notifications: notifications.data,
      organizations: organizations.data,
      lms_connections: lmsConnections.data,
      google_calendar: googleCalendar.data,
      busy_times: busyTimes.data,
      card_generations: cardGenerations.data,
    };
    const date = body.generated_at.slice(0, 10);
    return new Response(JSON.stringify(body, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="studypulse-export-${date}.json"`,
        "Cache-Control": "no-store",
      },
    });
  }),
);
