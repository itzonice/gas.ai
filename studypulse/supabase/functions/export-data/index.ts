// GET /export-data
// Everything StudyPulse stores about the caller, as one JSON download. Reads through
// the caller's RLS, so it can only ever contain their own data. Uploaded syllabus files
// are included as signed links valid for 15 minutes.
import { createHandler } from "../_shared/handler.ts";
import { requireMethod } from "../_shared/http.ts";
import { readAll } from "../_shared/paging.ts";
import { requireUser, userClient } from "../_shared/supabase.ts";

/** Links to the original syllabus files in an export stay valid this long. */
const SIGNED_URL_SECONDS = 15 * 60;

export const EXPORT_FORMAT_VERSION = 1;

type Row = Record<string, unknown>;

/** Groups rows by one of their columns. */
function groupBy(rows: Row[], column: string): Map<unknown, Row[]> {
  const groups = new Map<unknown, Row[]>();
  for (const row of rows) {
    const key = row[column];
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }
  return groups;
}

Deno.serve(
  createHandler("export-data", async (req) => {
    requireMethod(req, "GET");
    const user = await requireUser(req);
    const db = userClient(req);

    // The API returns at most 100 rows per request, for nested lists too, so every list
    // that can grow is read in pages and a course's rows are attached to it here. That
    // keeps the export complete however much the student has stored.
    const [
      profile,
      prefs,
      courses,
      categories,
      assignments,
      resources,
      cardSets,
      flashcards,
      notes,
      meetings,
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
    ] = await Promise.all([
      db.from("profiles").select("*").single(),
      db.from("notification_prefs").select("*").maybeSingle(),
      readAll<Row>((from, to) =>
        db.from("courses").select("*").order("created_at").order("id").range(from, to),
      ),
      readAll<Row>((from, to) =>
        db.from("grade_categories").select("*").order("position").order("id").range(from, to),
      ),
      readAll<Row>((from, to) =>
        db.from("assignments").select("*").order("created_at").order("id").range(from, to),
      ),
      readAll<Row>((from, to) =>
        db.from("assignment_resources").select("*").order("position").order("id").range(from, to),
      ),
      readAll<Row>((from, to) =>
        db.from("card_sets").select("*").order("created_at").order("id").range(from, to),
      ),
      readAll<Row>(
        (from, to) =>
          db
            .from("flashcards")
            .select("*")
            .order("set_id")
            .order("position")
            .order("id")
            .range(from, to),
        200_000,
      ),
      readAll<Row>((from, to) =>
        db.from("notes").select("*").order("created_at").order("id").range(from, to),
      ),
      readAll<Row>((from, to) =>
        db.from("course_meetings").select("*").order("created_at").order("id").range(from, to),
      ),
      readAll((from, to) =>
        db.from("study_sessions").select("*").order("started_at").order("id").range(from, to),
      ),
      readAll((from, to) =>
        db.from("study_blocks").select("*").order("starts_at").order("id").range(from, to),
      ),
      readAll((from, to) =>
        db.from("syllabus_uploads").select("*").order("created_at").order("id").range(from, to),
      ),
      db
        .from("subscriptions")
        .select(
          "provider, product_id, status, current_period_end, cancel_at_period_end, created_at",
        ),
      db
        .from("notification_tokens")
        .select("provider, platform, app_version, last_seen_at, invalidated_at, created_at"),
      readAll((from, to) =>
        db
          .from("notification_log")
          .select("kind, channel, status, title, body, created_at")
          .order("created_at")
          .order("id")
          .range(from, to),
      ),
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
      readAll((from, to) =>
        db
          .from("external_busy_times")
          .select("source, starts_at, ends_at")
          .order("starts_at")
          .order("id")
          .range(from, to),
      ),
      readAll((from, to) =>
        db
          .from("card_generations")
          .select("course_id, status, card_count, notes_chars, created_at")
          .order("created_at")
          .order("id")
          .range(from, to),
      ),
    ]);
    for (const r of [
      profile,
      prefs,
      subscriptions,
      devices,
      organizations,
      lmsConnections,
      googleCalendar,
    ]) {
      if (r.error) throw r.error;
    }

    const resourcesByAssignment = groupBy(resources, "assignment_id");
    const byCourse = {
      grade_categories: groupBy(categories, "course_id"),
      assignments: groupBy(
        assignments.map((a) => ({
          ...a,
          assignment_resources: resourcesByAssignment.get(a.id) ?? [],
        })),
        "course_id",
      ),
      card_sets: groupBy(cardSets, "course_id"),
      flashcards: groupBy(flashcards, "course_id"),
      notes: groupBy(notes, "course_id"),
      course_meetings: groupBy(meetings, "course_id"),
    };
    const coursesWithRows = courses.map((course) => ({
      ...course,
      grade_categories: byCourse.grade_categories.get(course.id) ?? [],
      assignments: byCourse.assignments.get(course.id) ?? [],
      card_sets: byCourse.card_sets.get(course.id) ?? [],
      flashcards: byCourse.flashcards.get(course.id) ?? [],
      notes: byCourse.notes.get(course.id) ?? [],
      course_meetings: byCourse.course_meetings.get(course.id) ?? [],
    }));

    const uploadRows = uploads as { file_path: string | null }[];
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
      courses: coursesWithRows,
      study_sessions: sessions,
      study_blocks: blocks,
      syllabus_uploads: withLinks,
      subscriptions: subscriptions.data,
      devices: devices.data,
      notifications,
      organizations: organizations.data,
      lms_connections: lmsConnections.data,
      google_calendar: googleCalendar.data,
      busy_times: busyTimes,
      card_generations: cardGenerations,
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
