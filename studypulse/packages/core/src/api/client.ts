// Typed API client over the Supabase RPCs and edge functions, shared by web and mobile.
// Every method is async, validates its input with zod before any network call, and
// rejects with an ApiError on any failure.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@studypulse/db";
import { z } from "zod";

import {
  billingStatusSchema,
  checkoutInputSchema,
  type BillingInterval,
  type BillingStatus,
} from "../billing/plans.ts";
import { commitPayloadSchema, type CommitPayload } from "../parser/commit.ts";
import { addResourceInputSchema, type AddResourceInput } from "../resources/index.ts";
import { ApiError, fromPostgrestError } from "./errors.ts";
import {
  blockStatusInputSchema,
  calendarRangeInputSchema,
  courseTargetInputSchema,
  featuresResponseSchema,
  coursesOverviewSchema,
  notificationPrefsUpdateSchema,
  onboardingInputSchema,
  profileUpdateSchema,
  settingsSchema,
  statsOverviewSchema,
  statsWeeksSchema,
  focusOverviewInputSchema,
  focusOverviewSchema,
  calendarRangeSchema,
  createAssignmentInputSchema,
  exportCardsInputSchema,
  generateCardsRequestSchema,
  registerPushTokenInputSchema,
  updateAssignmentInputSchema,
  startSessionInputSchema,
  stopSessionInputSchema,
  todayFeedInputSchema,
  todayFeedRowSchema,
  todayOverviewSchema,
  uploadSyllabusFileInputSchema,
  uploadSyllabusInputSchema,
  uuidSchema,
  type CreateAssignmentInput,
  type ExportCardsInput,
  type GenerateCardsRequest,
  type GeneratedCardsResponse,
  type UpdateAssignmentInput,
  type FocusOverviewInput,
  type NotificationPrefsUpdate,
  type OnboardingInput,
  type ProfileUpdate,
  type StartSessionInput,
  type StopSessionInput,
  type BlockStatusInput,
  type CalendarRange,
  type CalendarRangeInput,
  type CourseTargetInput,
  type TodayFeedInput,
  type TodayFeedRow,
  type TodayOverview,
  type UploadSyllabusFileInput,
  type UploadSyllabusInput,
} from "./schemas.ts";

type Db = SupabaseClient<Database>;
type Functions = Database["public"]["Functions"];

export type ParseQuota = Functions["get_parse_quota"]["Returns"][number];

/** Validates input, throwing ApiError(400) with field issues. */
export function validate<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  throw new ApiError(400, "invalid_input", "Some fields need attention", {
    issues: result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
  });
}

/** Unwraps a PostgREST response. */
function unwrap<T>(res: { data: T | null; error: { code?: string; message: string } | null }): T {
  if (res.error) throw fromPostgrestError(res.error);
  if (res.data === null) throw new ApiError(404, "not_found", "Not found");
  return res.data;
}

/** Validates a JSON response from an RPC; a mismatch is a server bug, reported as 502. */
function parseResponse<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const parsed = schema.safeParse(data);
  if (parsed.success) return parsed.data;
  throw new ApiError(502, "bad_response", "Unexpected response from StudyPulse", {
    cause: parsed.error,
  });
}

/** Edge function error bodies look like { error, message, details?, request_id }. */
async function functionError(error: unknown): Promise<ApiError> {
  const context = (error as { context?: unknown }).context;
  if (context instanceof Response) {
    let body: { error?: string; message?: string; details?: unknown; request_id?: string } = {};
    try {
      body = (await context.clone().json()) as typeof body;
    } catch {
      // not JSON
    }
    const issues = Array.isArray(body.details)
      ? (body.details as { path: string; message: string }[])
      : [];
    return new ApiError(
      context.status,
      body.error ?? "request_failed",
      body.message ?? context.statusText,
      {
        issues,
        ...(body.request_id ? { requestId: body.request_id } : {}),
        cause: error,
      },
    );
  }
  return new ApiError(503, "network_error", "Couldn't reach StudyPulse. Check your connection.", {
    cause: error,
  });
}

type AssignmentInsert = Database["public"]["Tables"]["assignments"]["Insert"];

/** camelCase API fields -> snake_case columns (only the fields that are present). */
function toAssignmentColumns(input: Partial<Record<string, unknown>>): Partial<AssignmentInsert> {
  const map: Record<string, keyof AssignmentInsert> = {
    courseId: "course_id",
    title: "title",
    kind: "kind",
    categoryId: "category_id",
    description: "description",
    dueAt: "due_at",
    pointsPossible: "points_possible",
    pointsEarned: "points_earned",
    estimatedMinutes: "estimated_minutes",
    status: "status",
  };
  const out: Record<string, unknown> = {};
  for (const [key, column] of Object.entries(map)) {
    if (input[key] !== undefined) out[column] = input[key];
  }
  return out;
}

export function createApiClient(db: Db) {
  async function invoke<T>(
    name: string,
    options: { body?: unknown; method?: "GET" | "POST" | "PATCH" | "DELETE" } = {},
  ) {
    const res = await db.functions.invoke(name, {
      method: options.method ?? "POST",
      ...(options.body === undefined ? {} : { body: options.body as Record<string, unknown> }),
    });
    const error: unknown = res.error;
    if (error) throw await functionError(error);
    return res.data as T;
  }

  /** Starts parsing a syllabus (file already in storage, pasted text, or a URL). */
  async function uploadSyllabus(input: UploadSyllabusInput) {
    return await invoke<{ upload_id: string; status: string }>("upload-syllabus", {
      body: validate(uploadSyllabusInputSchema, input),
    });
  }

  return {
    syllabus: {
      upload: uploadSyllabus,
      /**
       * Puts a PDF or photo in the caller's folder of the syllabi bucket, then starts
       * parsing it. The server checks the file's bytes again.
       */
      async uploadFile(file: Blob, input: Omit<UploadSyllabusFileInput, "type" | "size">) {
        const valid = validate(uploadSyllabusFileInputSchema, {
          ...input,
          type: file.type,
          size: file.size,
        });
        const { data: auth } = await db.auth.getUser();
        if (!auth.user) throw new ApiError(401, "unauthorized", "Sign in to upload a syllabus");
        const safeName = valid.filename.replace(/[^A-Za-z0-9._-]+/g, "_").slice(-100);
        const path = `${auth.user.id}/${crypto.randomUUID()}-${safeName}`;
        const { error } = await db.storage
          .from("syllabi")
          .upload(path, file, { contentType: valid.type, upsert: false });
        if (error) {
          throw new ApiError(503, "upload_failed", "Couldn't upload the file. Try again.", {
            cause: error,
          });
        }
        return await uploadSyllabus({
          source: "file",
          file_path: path,
          original_filename: valid.filename,
          ...(valid.term_start ? { term_start: valid.term_start } : {}),
          ...(valid.term_end ? { term_end: valid.term_end } : {}),
        });
      },
      /** The caller's upload, including status and parse_result once parsed. */
      async get(uploadId: string) {
        const id = validate(uuidSchema, uploadId);
        const { data, error } = await db
          .from("syllabus_uploads")
          .select("*")
          .eq("id", id)
          .maybeSingle();
        if (error) throw fromPostgrestError(error);
        if (!data) throw new ApiError(404, "not_found", "Syllabus upload not found");
        return data;
      },
      /** Commits a reviewed parse into a course. Returns the course id. */
      async commit(uploadId: string, payload?: CommitPayload) {
        const id = validate(uuidSchema, uploadId);
        const body = payload === undefined ? null : validate(commitPayloadSchema, payload);
        return unwrap(
          await db.rpc("commit_parsed_syllabus", {
            p_upload_id: id,
            ...(body ? { p_payload: body } : {}),
          }),
        );
      },
      async quota(): Promise<ParseQuota> {
        const rows = unwrap(await db.rpc("get_parse_quota"));
        const row = rows[0];
        if (!row) throw new ApiError(404, "not_found", "No quota found");
        return row;
      },
    },

    today: {
      /** Ranked tasks for the user's local day, capped by their study minutes. */
      async feed(input: TodayFeedInput = {}): Promise<TodayFeedRow[]> {
        const { date } = validate(todayFeedInputSchema, input);
        return parseResponse(
          z.array(todayFeedRowSchema),
          unwrap(await db.rpc("get_today_feed", date ? { p_date: date } : {})),
        );
      },
      /** Metric cards, today's reviews, the next exam, and course chips, in one call. */
      async overview(): Promise<TodayOverview> {
        return parseResponse(todayOverviewSchema, unwrap(await db.rpc("get_today_overview")));
      },
    },

    /** Which optional features the server has turned on (billing, email, Google, ...). */
    async features() {
      const res = await db.functions.invoke("features", { method: "GET" });
      const error: unknown = res.error;
      if (error) throw await functionError(error);
      return parseResponse(featuresResponseSchema, res.data).features;
    },

    courses: {
      /** Active courses with current grade, letter, target, and the next thing due. */
      async overview() {
        return parseResponse(coursesOverviewSchema, unwrap(await db.rpc("get_courses_overview")));
      },
      /** One course with its grade categories and assignments (soonest due first). */
      async get(courseId: string) {
        const id = validate(uuidSchema, courseId);
        const [course, categories, assignments, profile] = await Promise.all([
          db
            .from("courses")
            .select(
              "id, name, code, color, instructor, term_start, term_end, target_grade, letter_scale, archived_at",
            )
            .eq("id", id)
            .maybeSingle(),
          db
            .from("grade_categories")
            .select("id, name, weight, drop_lowest, position")
            .eq("course_id", id)
            .order("position"),
          db
            .from("assignments")
            .select(
              "id, title, kind, status, due_at, category_id, points_earned, points_possible, source",
            )
            .eq("course_id", id)
            .order("due_at", { ascending: true, nullsFirst: false }),
          db.from("profiles").select("timezone").maybeSingle(),
        ]);
        for (const res of [course, categories, assignments, profile]) {
          if (res.error) throw fromPostgrestError(res.error);
        }
        if (!course.data) throw new ApiError(404, "not_found", "Course not found");
        return {
          course: course.data,
          categories: categories.data ?? [],
          assignments: assignments.data ?? [],
          timezone: profile.data?.timezone ?? "UTC",
        };
      },
      /** The grade the student is aiming for (null to clear it). */
      async setTarget(input: CourseTargetInput): Promise<void> {
        const { courseId, targetGrade } = validate(courseTargetInputSchema, input);
        const { error } = await db
          .from("courses")
          .update({ target_grade: targetGrade })
          .eq("id", courseId);
        if (error) throw fromPostgrestError(error);
      },
    },

    assignments: {
      /** Assignments in a course (or all courses), soonest due first, undated last. */
      async list(courseId?: string) {
        let query = db
          .from("assignments")
          .select("*")
          .order("due_at", { ascending: true, nullsFirst: false });
        if (courseId) query = query.eq("course_id", validate(uuidSchema, courseId));
        return unwrap(await query);
      },
      async create(input: CreateAssignmentInput) {
        const valid = validate(createAssignmentInputSchema, input);
        const row = {
          ...toAssignmentColumns(valid),
          course_id: valid.courseId,
          title: valid.title,
        };
        return unwrap(await db.from("assignments").insert(row).select("*").single());
      },
      /**
       * Updates fields. Changing the due date, status, estimate, or grading fields
       * recomputes the study plan server-side: blocks past a new due date are removed
       * immediately and the plan is rebuilt within about a minute.
       */
      async update(input: UpdateAssignmentInput) {
        const { id, ...fields } = validate(updateAssignmentInputSchema, input);
        return unwrap(
          await db
            .from("assignments")
            .update(toAssignmentColumns(fields))
            .eq("id", id)
            .select("*")
            .single(),
        );
      },
      async remove(id: string) {
        const valid = validate(uuidSchema, id);
        const { error } = await db.from("assignments").delete().eq("id", valid);
        if (error) throw fromPostgrestError(error);
      },
    },

    resources: {
      /** Study links for an assignment, in the order the student arranged them. */
      async list(assignmentId: string) {
        const id = validate(uuidSchema, assignmentId);
        return unwrap(
          await db
            .from("assignment_resources")
            .select("id, kind, url, title, position, created_at")
            .eq("assignment_id", id)
            .order("position")
            .order("created_at"),
        );
      },
      /** Adds a link; its kind (Khan Academy, NotebookLM, Anki deck, other) comes from the URL. */
      async add(input: AddResourceInput) {
        const valid = validate(addResourceInputSchema, input);
        const { data: assignment, error } = await db
          .from("assignments")
          .select("course_id")
          .eq("id", valid.assignmentId)
          .maybeSingle();
        if (error) throw fromPostgrestError(error);
        if (!assignment) throw new ApiError(404, "not_found", "Assignment not found");
        return unwrap(
          await db
            .from("assignment_resources")
            .insert({
              assignment_id: valid.assignmentId,
              course_id: assignment.course_id,
              kind: valid.kind,
              url: valid.url,
              title: valid.title ?? null,
            })
            .select("id, kind, url, title, position, created_at")
            .single(),
        );
      },
      async remove(resourceId: string): Promise<void> {
        const id = validate(uuidSchema, resourceId);
        const { error } = await db.from("assignment_resources").delete().eq("id", id);
        if (error) throw fromPostgrestError(error);
      },
    },

    sessions: {
      /**
       * The Focus screen in one call: today's minutes and streak (user's timezone), the
       * running session, what the timer is linked to, things to link it to, and history.
       */
      async overview(input: FocusOverviewInput = {}) {
        const { assignmentId, blockId } = validate(focusOverviewInputSchema, input);
        return parseResponse(
          focusOverviewSchema,
          unwrap(
            await db.rpc("get_focus_overview", {
              ...(assignmentId ? { p_assignment_id: assignmentId } : {}),
              ...(blockId ? { p_block_id: blockId } : {}),
            }),
          ),
        );
      },
      /**
       * Starts a study session. Pass a client-generated id (e.g. crypto.randomUUID())
       * and persist it before calling, so a retry after a lost response is idempotent.
       * Fails with 409 conflict if another session overlaps (stop it first).
       */
      async start(input: Omit<StartSessionInput, "id"> & { id?: string }) {
        const { id, courseId, assignmentId, startedAt } = validate(startSessionInputSchema, {
          ...input,
          id: input.id ?? crypto.randomUUID(),
        });
        return unwrap(
          await db
            .rpc("start_study_session", {
              p_id: id,
              p_course_id: courseId,
              ...(assignmentId ? { p_assignment_id: assignmentId } : {}),
              ...(startedAt ? { p_started_at: startedAt } : {}),
            })
            .single(),
        );
      },
      /** Stops a session. Safe to retry: stopping a stopped session returns it unchanged. */
      async stop(input: StopSessionInput) {
        const { id, endedAt } = validate(stopSessionInputSchema, input);
        return unwrap(
          await db
            .rpc("stop_study_session", { p_id: id, ...(endedAt ? { p_ended_at: endedAt } : {}) })
            .single(),
        );
      },
    },

    settings: {
      /** Profile, reminder preferences, and devices, plus the sign-in email. */
      async get() {
        const [{ data: auth }, settings] = await Promise.all([
          db.auth.getUser(),
          db.rpc("get_settings"),
        ]);
        const data = unwrap(settings) as Record<string, unknown>;
        return parseResponse(settingsSchema, { ...data, email: auth.user?.email ?? null });
      },
      /** Saves profile fields that are present (name, school, timezone, study time...). */
      async updateProfile(input: ProfileUpdate): Promise<void> {
        const v = validate(profileUpdateSchema, input);
        const columns = {
          ...(v.displayName !== undefined
            ? { display_name: v.displayName === "" ? null : v.displayName }
            : {}),
          ...(v.school !== undefined ? { school: v.school === "" ? null : v.school } : {}),
          ...(v.timezone !== undefined ? { timezone: v.timezone } : {}),
          ...(v.dailyStudyMinutes !== undefined
            ? { daily_study_minutes: v.dailyStudyMinutes }
            : {}),
          ...(v.studyStartTime !== undefined ? { study_start_time: v.studyStartTime } : {}),
          ...(v.cardTasksEnabled !== undefined ? { card_tasks_enabled: v.cardTasksEnabled } : {}),
        };
        if (Object.keys(columns).length === 0) return;
        const { data: auth, error: authError } = await db.auth.getUser();
        if (authError) throw new ApiError(401, "unauthorized", authError.message);
        const { error } = await db.from("profiles").update(columns).eq("id", auth.user.id);
        if (error) throw fromPostgrestError(error);
      },
      /** Saves reminder preferences that are present. */
      async updateNotifications(input: NotificationPrefsUpdate): Promise<void> {
        const v = validate(notificationPrefsUpdateSchema, input);
        if (Object.keys(v).length === 0) return;
        const { data: auth, error: authError } = await db.auth.getUser();
        if (authError) throw new ApiError(401, "unauthorized", authError.message);
        const { error } = await db.from("notification_prefs").update(v).eq("user_id", auth.user.id);
        if (error) throw fromPostgrestError(error);
      },
    },

    onboarding: {
      /** Whether this user still needs onboarding (a new account). */
      async needed(): Promise<boolean> {
        const { data: auth, error: authError } = await db.auth.getUser();
        if (authError) throw new ApiError(401, "unauthorized", authError.message);
        const { data, error } = await db
          .from("profiles")
          .select("onboarded_at")
          .eq("id", auth.user.id)
          .single();
        if (error) throw fromPostgrestError(error);
        return data.onboarded_at === null;
      },
      /** Saves the answers and marks onboarding done. */
      async complete(input: OnboardingInput): Promise<void> {
        const v = validate(onboardingInputSchema, input);
        const { error } = await db.rpc("complete_onboarding", {
          p_display_name: v.displayName,
          p_timezone: v.timezone,
          p_daily_study_minutes: v.dailyStudyMinutes,
          p_study_start_time: v.studyStartTime,
        });
        if (error) throw fromPostgrestError(error);
      },
    },

    stats: {
      /** Focus minutes against current grade per course over the last `weeks` weeks. */
      async overview(weeks = 4) {
        const p_weeks = validate(statsWeeksSchema, weeks);
        return parseResponse(
          statsOverviewSchema,
          unwrap(await db.rpc("get_stats_overview", { p_weeks })),
        );
      },
    },

    plan: {
      /** Rebuilds the study plan for the next four weeks. */
      async rebuild() {
        return await invoke<{
          blocks: number;
          scheduled_minutes: number;
          unscheduled: { assignmentId: string; minutes: number }[];
          overloaded_days: string[];
        }>("plan-study");
      },
      /** Marks a study block done (or back to planned, or missed). */
      async setBlockStatus(input: BlockStatusInput) {
        const { id, status } = validate(blockStatusInputSchema, input);
        return unwrap(
          await db
            .from("study_blocks")
            .update({ status })
            .eq("id", id)
            .select("id, status, completed_at")
            .single(),
        );
      },
    },

    grades: {
      /** Current grade of a course, computed by the database (null before any grades). */
      async current(courseId: string): Promise<number | null> {
        const id = validate(uuidSchema, courseId);
        const { data, error } = await db.rpc("course_current_grade", { p_course_id: id });
        if (error) throw fromPostgrestError(error);
        return data;
      },
      async weeklyFocus() {
        return unwrap(
          await db
            .from("weekly_focus_by_course")
            .select("*")
            .order("week_start", { ascending: false }),
        );
      },
    },

    account: {
      /** Everything stored about the user, as a JSON file (the privacy export). */
      async exportData(): Promise<Blob> {
        const res = await db.functions.invoke("export-data", { method: "GET" });
        const error: unknown = res.error;
        if (error) throw await functionError(error);
        const data: unknown = res.data;
        return data instanceof Blob
          ? data
          : new Blob([JSON.stringify(data)], { type: "application/json" });
      },
      /**
       * Permanently deletes the account, its files, and all its data. The UI must get an
       * explicit confirmation first; the server also requires `confirm: "DELETE"`.
       */
      async delete(confirm: "DELETE") {
        return await invoke<{ deleted: true }>("delete-account", { body: { confirm } });
      },
    },

    notifications: {
      /**
       * Registers this device's push token (call on every app start and whenever the
       * token changes). Pass a stable deviceId so rotated tokens replace old ones.
       */
      async registerPushToken(input: {
        provider: "expo" | "web_push";
        token: string;
        platform: "ios" | "android" | "web";
        deviceId?: string;
        appVersion?: string;
        webPushKeys?: { p256dh: string; auth: string };
      }): Promise<string> {
        const valid = validate(registerPushTokenInputSchema, input);
        return unwrap(
          await db.rpc("register_push_token", {
            p_provider: valid.provider,
            p_token: valid.token,
            p_platform: valid.platform,
            ...(valid.deviceId ? { p_device_id: valid.deviceId } : {}),
            ...(valid.appVersion ? { p_app_version: valid.appVersion } : {}),
            ...(valid.webPushKeys ? { p_web_push_keys: valid.webPushKeys } : {}),
          }),
        );
      },
      /** Removes this device's token (call on sign-out). */
      async unregisterPushToken(provider: "expo" | "web_push", token: string): Promise<void> {
        const { error } = await db.rpc("unregister_push_token", {
          p_provider: provider,
          p_token: token,
        });
        if (error) throw fromPostgrestError(error);
      },
    },

    calendar: {
      /** Due dates and study blocks between two local dates (at most 62 days). */
      async range(input: CalendarRangeInput): Promise<CalendarRange> {
        const { from, to } = validate(calendarRangeInputSchema, input);
        return parseResponse(
          calendarRangeSchema,
          unwrap(await db.rpc("get_calendar", { p_from: from, p_to: to })),
        );
      },
      /**
       * Creates a new secret feed token (the old feed URL stops working) and returns it.
       * Build the subscribe link with calendarFeedUrl() from @studypulse/core/ics.
       * The token is shown once; only its hash is stored.
       */
      async rotateFeedToken(): Promise<string> {
        return unwrap(await db.rpc("rotate_calendar_token"));
      },
      async disableFeed(): Promise<void> {
        const { error } = await db.rpc("revoke_calendar_token");
        if (error) throw fromPostgrestError(error);
      },
    },

    cards: {
      /**
       * Turns notes into question cards and saves them to the course (so exports include
       * them). Passing a "Make 5–20 cards" task marks it done.
       */
      async generate(input: GenerateCardsRequest): Promise<GeneratedCardsResponse> {
        const valid = validate(generateCardsRequestSchema, input);
        return await invoke<GeneratedCardsResponse>("generate-cards", {
          body: {
            course_id: valid.courseId,
            notes: valid.notes,
            ...(valid.assignmentId ? { assignment_id: valid.assignmentId } : {}),
            ...(valid.maxCards ? { max_cards: valid.maxCards } : {}),
          },
        });
      },
      /** Card generations left today. */
      async quota() {
        const rows = unwrap(await db.rpc("get_card_quota"));
        const row = rows[0];
        if (!row) throw new ApiError(404, "not_found", "No quota found");
        return row;
      },
      /** Downloads a course's flashcards as an Anki CSV or Quizlet TSV. */
      async export(input: ExportCardsInput): Promise<Blob> {
        const { courseId, format } = validate(exportCardsInputSchema, input);
        const res = await db.functions.invoke(
          `export-cards?course_id=${encodeURIComponent(courseId)}&format=${format}`,
          { method: "GET" },
        );
        const error: unknown = res.error;
        if (error) throw await functionError(error);
        const data: unknown = res.data;
        if (data instanceof Blob) return data;
        return new Blob([typeof data === "string" ? data : JSON.stringify(data)], {
          type: "text/plain",
        });
      },
    },

    organizations: {
      /** Organizations the user belongs to, with their role and sharing choice. */
      async mine() {
        const { data, error } = await db
          .from("organization_memberships")
          .select("organization_id, role, share_focus_hours, joined_at, organizations(name)");
        if (error) throw fromPostgrestError(error);
        return data;
      },
      /** Creates an organization; the caller becomes its admin. Returns the join code. */
      async create(name: string) {
        const rows = unwrap(await db.rpc("create_organization", { p_name: name }));
        const row = rows[0];
        if (!row) throw new ApiError(500, "invalid_response", "Organization not created");
        return row;
      },
      /** Joins as a student. Focus-hour sharing stays off until setSharing(true). */
      async join(joinCode: string): Promise<string> {
        return unwrap(await db.rpc("join_organization", { p_join_code: joinCode }));
      },
      async leave(organizationId: string): Promise<void> {
        const { error } = await db.rpc("leave_organization", {
          p_organization_id: validate(uuidSchema, organizationId),
        });
        if (error) throw fromPostgrestError(error);
      },
      /**
       * The student's opt-in to share focus hours with an organization. Only weekly totals
       * across at least 3 opted-in students are ever shown; turning it off removes the
       * student from all reports, past weeks included.
       */
      async setSharing(organizationId: string, share: boolean): Promise<void> {
        const { error } = await db.rpc("set_focus_sharing", {
          p_organization_id: validate(uuidSchema, organizationId),
          p_share: share,
        });
        if (error) throw fromPostgrestError(error);
      },
      /** Admins: weekly aggregate focus hours (null where fewer than 3 students). */
      async focusSummary(organizationId: string, weeks = 12) {
        return unwrap(
          await db.rpc("org_focus_summary", {
            p_organization_id: validate(uuidSchema, organizationId),
            p_weeks: weeks,
          }),
        );
      },
      /** Admins: members, roles, and who shares. No study data. */
      async roster(organizationId: string) {
        return unwrap(
          await db.rpc("organization_roster", {
            p_organization_id: validate(uuidSchema, organizationId),
          }),
        );
      },
      /** Admins: a new join code (the old one stops working). */
      async rotateJoinCode(organizationId: string): Promise<string> {
        return unwrap(
          await db.rpc("rotate_join_code", {
            p_organization_id: validate(uuidSchema, organizationId),
          }),
        );
      },
    },

    integrations: {
      /** Schools with Canvas available (name and URL). */
      async canvasSchools() {
        const { data, error } = await db
          .from("lms_institutions")
          .select("id, name, base_url")
          .order("name");
        if (error) throw fromPostgrestError(error);
        return data;
      },
      /** The user's Canvas connections and their sync state. */
      async canvasConnections() {
        const { data, error } = await db
          .from("lms_connections")
          .select(
            "id, institution_id, external_user_name, status, last_error, connected_at, last_synced_at",
          );
        if (error) throw fromPostgrestError(error);
        return data;
      },
      /** The Canvas approval page to send the user to. */
      async connectCanvas(institutionId: string): Promise<string> {
        const body = { institution_id: validate(uuidSchema, institutionId) };
        const { url } = await invoke<{ url: string }>("canvas-oauth/start", { body });
        return url;
      },
      /** Syncs now (at most every 5 minutes per connection). */
      async syncCanvas(connectionId?: string) {
        return invoke<{ results: Record<string, unknown> }>("canvas-sync", {
          body: connectionId ? { connection_id: validate(uuidSchema, connectionId) } : {},
        });
      },
      /** The user's Google Calendar connection, or null. */
      async googleCalendar() {
        const { data, error } = await db
          .from("google_calendar_connections")
          .select("status, push_enabled, read_busy, last_error, connected_at, last_synced_at")
          .maybeSingle();
        if (error) throw fromPostgrestError(error);
        return data;
      },
      /** Google's consent page to send the user to. */
      async connectGoogleCalendar(): Promise<string> {
        const { url } = await invoke<{ url: string }>("google-oauth/start");
        return url;
      },
      /** Pushes blocks and deadlines and reads busy times now (at most once a minute). */
      async syncGoogleCalendar() {
        return invoke<Record<string, unknown>>("google-calendar-sync");
      },
      /** Turns pushing events or reading busy times on or off. */
      async setGoogleCalendarOptions(options: { pushEnabled?: boolean; readBusy?: boolean }) {
        const patch = {
          ...(options.pushEnabled === undefined ? {} : { push_enabled: options.pushEnabled }),
          ...(options.readBusy === undefined ? {} : { read_busy: options.readBusy }),
        };
        const { data: auth } = await db.auth.getUser();
        if (!auth.user) throw new ApiError(401, "unauthorized", "Sign in first");
        const { error } = await db
          .from("google_calendar_connections")
          .update(patch)
          .eq("user_id", auth.user.id);
        if (error) throw fromPostgrestError(error);
      },
      /** Disconnects and revokes access at Google. The StudyPulse calendar stays in Google. */
      async disconnectGoogleCalendar(): Promise<void> {
        await invoke("google-oauth/disconnect");
      },
      /** Disconnects and revokes access at Canvas. Synced courses stay. */
      async disconnectCanvas(connectionId: string): Promise<void> {
        await invoke("canvas-oauth/disconnect", {
          body: { connection_id: validate(uuidSchema, connectionId) },
        });
      },
    },

    billing: {
      /**
       * Starts a Stripe Checkout for Pro (web); redirect to the returned URL. Throws
       * ApiError "already_subscribed" (409) if the user already has Pro anywhere,
       * "student_email_required" (403) for the student discount without a confirmed
       * school email, and "invalid_promo_code" (400).
       */
      async startCheckout(
        interval: BillingInterval,
        discount: { student?: boolean; promoCode?: string } = {},
      ): Promise<string> {
        const body = validate(checkoutInputSchema, { interval, ...discount });
        const { url } = await invoke<{ url: string }>("stripe-checkout", { body });
        return url;
      },
      /** The Stripe customer-portal URL for web subscribers (ApiError 404 otherwise). */
      async openPortal(): Promise<string> {
        const { url } = await invoke<{ url: string }>("stripe-portal");
        return url;
      },
      /**
       * Plan summary for settings and paywalls. Pro bought on any platform counts
       * everywhere; `manage_in` says where to change it (store purchases can only be
       * managed in that store).
       */
      async status(): Promise<BillingStatus> {
        const data: unknown = unwrap(await db.rpc("billing_status"));
        const parsed = billingStatusSchema.safeParse(data);
        if (!parsed.success)
          throw new ApiError(500, "invalid_response", "Unexpected billing status");
        return parsed.data;
      },
      /** Whether the signed-in user has Pro right now (subscriptions on any platform). */
      async isPro(): Promise<boolean> {
        const { data: auth, error: authError } = await db.auth.getUser();
        if (authError) throw new ApiError(401, "unauthorized", authError.message);
        return unwrap(await db.rpc("is_pro", { p_user_id: auth.user.id }));
      },
      /** The user's subscriptions on every platform (read through RLS). */
      async subscriptions() {
        const { data, error } = await db
          .from("subscriptions")
          .select(
            "provider, product_id, status, current_period_end, cancel_at_period_end, grace_period_ends_at",
          )
          .order("created_at", { ascending: false });
        if (error) throw fromPostgrestError(error);
        return data;
      },
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
