// Typed API client over the Supabase RPCs and edge functions, shared by web and mobile.
// Every method is async, validates its input with zod before any network call, and
// rejects with an ApiError on any failure.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@studypulse/db";
import type { z } from "zod";

import { commitPayloadSchema, type CommitPayload } from "../parser/commit.ts";
import { ApiError, fromPostgrestError } from "./errors.ts";
import {
  exportCardsInputSchema,
  startSessionInputSchema,
  stopSessionInputSchema,
  todayFeedInputSchema,
  uploadSyllabusInputSchema,
  uuidSchema,
  type ExportCardsInput,
  type StartSessionInput,
  type StopSessionInput,
  type TodayFeedInput,
  type UploadSyllabusInput,
} from "./schemas.ts";

type Db = SupabaseClient<Database>;
type Functions = Database["public"]["Functions"];

export type TodayFeedRow = Functions["get_today_feed"]["Returns"][number];
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

  return {
    syllabus: {
      /** Starts parsing a syllabus (file already in storage, pasted text, or a URL). */
      async upload(input: UploadSyllabusInput) {
        return await invoke<{ upload_id: string; status: string }>("upload-syllabus", {
          body: validate(uploadSyllabusInputSchema, input),
        });
      },
      /** The caller's upload, including status and parse_result once parsed. */
      async get(uploadId: string) {
        const id = validate(uuidSchema, uploadId);
        return unwrap(await db.from("syllabus_uploads").select("*").eq("id", id).maybeSingle());
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
        return unwrap(await db.rpc("get_today_feed", date ? { p_date: date } : {}));
      },
    },

    sessions: {
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

    cards: {
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
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
