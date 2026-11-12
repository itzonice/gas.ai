// Canvas → StudyPulse sync: read the student's active courses, assignment groups, and
// assignments (with their own submission scores) from the Canvas REST API, and map them
// to the payload lms_apply_canvas_sync applies. Matching, incremental skipping, and
// "the user's edits win" happen in SQL; this side only fetches and normalizes.
import { z } from "zod";

export interface CanvasApiOptions {
  fetch?: typeof fetch;
  /** Safety cap on pages per list (100 items each). */
  maxPages?: number;
}

export class CanvasApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(`Canvas API ${String(status)}: ${message}`);
    this.name = "CanvasApiError";
    this.status = status;
  }
}

/** The rel="next" URL from a Link header, if any. */
export function nextLink(header: string | null): string | null {
  if (!header) return null;
  for (const part of header.split(",")) {
    const m = /<([^>]+)>\s*;\s*rel="?next"?/.exec(part);
    if (m?.[1]) return m[1];
  }
  return null;
}

/**
 * GETs every page of a Canvas list. Next links are only followed on the same origin:
 * the bearer token must never be sent anywhere else.
 */
export async function canvasList<S extends z.ZodType>(
  baseUrl: string,
  path: string,
  token: string,
  itemSchema: S,
  options: CanvasApiOptions = {},
): Promise<z.infer<S>[]> {
  const origin = new URL(baseUrl).origin;
  let url: string | null = new URL(path, baseUrl).toString();
  const items: z.infer<S>[] = [];
  for (let page = 0; url && page < (options.maxPages ?? 20); page++) {
    const res: Response = await (options.fetch ?? fetch)(url, {
      redirect: "error",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (!res.ok) {
      await res.body?.cancel();
      throw new CanvasApiError(res.status, res.statusText || "request failed");
    }
    const parsed = z.array(z.unknown()).safeParse(await res.json());
    if (!parsed.success) throw new CanvasApiError(res.status, `unexpected response for ${path}`);
    for (const raw of parsed.data) {
      // Skip items we can't read rather than failing the whole sync.
      const item = itemSchema.safeParse(raw);
      if (item.success) items.push(item.data);
    }
    const next = nextLink(res.headers.get("link"));
    url = next && new URL(next).origin === origin ? next : null;
  }
  return items;
}

const id = z.union([z.number(), z.string()]).transform(String);

export const canvasCourseSchema = z.looseObject({
  id,
  name: z.string().min(1),
  course_code: z.string().nullish(),
  apply_assignment_group_weights: z.boolean().nullish(),
  workflow_state: z.string().nullish(),
});
export type CanvasCourse = z.infer<typeof canvasCourseSchema>;

export const canvasGroupSchema = z.looseObject({
  id,
  name: z.string().min(1),
  group_weight: z.number().nullish(),
  position: z.number().int().nullish(),
});
export type CanvasGroup = z.infer<typeof canvasGroupSchema>;

export const canvasAssignmentSchema = z.looseObject({
  id,
  name: z.string().min(1),
  due_at: z.string().nullish(),
  points_possible: z.number().nullish(),
  assignment_group_id: id.nullish(),
  submission_types: z.array(z.string()).nullish(),
  is_quiz_assignment: z.boolean().nullish(),
  updated_at: z.string().nullish(),
  published: z.boolean().nullish(),
  submission: z
    .looseObject({
      score: z.number().nullish(),
      excused: z.boolean().nullish(),
      workflow_state: z.string().nullish(),
    })
    .nullish(),
});
export type CanvasAssignment = z.infer<typeof canvasAssignmentSchema>;

export type AssignmentKind =
  "assignment" | "quiz" | "exam" | "project" | "reading" | "lab" | "discussion" | "other";

/** Our assignment kind from Canvas's submission types and the title. */
export function canvasAssignmentKind(
  a: Pick<CanvasAssignment, "name" | "submission_types" | "is_quiz_assignment">,
): AssignmentKind {
  const title = a.name.toLowerCase();
  if (/\bproject\b/.test(title)) return "project"; // "Final Project" is not an exam
  if (/\b(exam|midterm|final)\b/.test(title)) return "exam";
  const types = a.submission_types ?? [];
  if (a.is_quiz_assignment || types.includes("online_quiz") || /\bquiz\b/.test(title))
    return "quiz";
  if (types.includes("discussion_topic")) return "discussion";
  if (/\blab\b/.test(title)) return "lab";
  if (/\b(reading|read ch)/.test(title)) return "reading";
  return "assignment";
}

// A type alias (not an interface) so the payload is assignable to the RPC's Json type.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type SyncAssignment = {
  external_id: string;
  title: string;
  due_at: string | null;
  points_possible: number | null;
  points_earned: number | null;
  kind: AssignmentKind;
  group_external_id: string | null;
  external_updated_at: string | null;
};

// A type alias (not an interface) so the payload is assignable to the RPC's Json type.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type SyncCourse = {
  external_id: string;
  name: string;
  code: string | null;
  weighted: boolean;
  groups: { external_id: string; name: string; weight: number; position: number }[];
  assignments: SyncAssignment[];
};

const isoOrNull = (v: string | null | undefined) => {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
};

/** Normalizes one course's Canvas data into the sync payload. */
export function toSyncCourse(
  course: CanvasCourse,
  groups: readonly CanvasGroup[],
  assignments: readonly CanvasAssignment[],
): SyncCourse {
  const weighted = course.apply_assignment_group_weights === true;
  return {
    external_id: course.id,
    name: course.name.trim().slice(0, 200),
    code: course.course_code?.trim() ? course.course_code.trim().slice(0, 50) : null,
    weighted,
    groups: weighted
      ? groups.map((g, i) => ({
          external_id: g.id,
          name: g.name.trim().slice(0, 100),
          weight: Math.min(100, Math.max(0, g.group_weight ?? 0)),
          position: g.position ?? i,
        }))
      : [],
    assignments: assignments
      .filter((a) => a.published !== false)
      .map((a) => {
        const possible = a.points_possible && a.points_possible > 0 ? a.points_possible : null;
        const score = a.submission?.excused ? null : (a.submission?.score ?? null);
        return {
          external_id: a.id,
          title: a.name.trim().slice(0, 300),
          due_at: isoOrNull(a.due_at),
          points_possible: possible,
          // Our schema needs points_possible for a score, and caps extra credit at 2x.
          points_earned:
            possible !== null && score !== null && score >= 0 && score <= possible * 2
              ? score
              : null,
          kind: canvasAssignmentKind(a),
          group_external_id: weighted ? (a.assignment_group_id ?? null) : null,
          external_updated_at: isoOrNull(a.updated_at),
        };
      }),
  };
}

/** Fetches everything the sync needs for the student's active courses. */
export async function fetchCanvasSnapshot(
  baseUrl: string,
  token: string,
  options: CanvasApiOptions = {},
): Promise<SyncCourse[]> {
  const courses = await canvasList(
    baseUrl,
    "/api/v1/courses?enrollment_type=student&enrollment_state=active&per_page=100",
    token,
    canvasCourseSchema,
    options,
  );
  const out: SyncCourse[] = [];
  for (const course of courses) {
    const base = `/api/v1/courses/${encodeURIComponent(course.id)}`;
    const [groups, assignments] = await Promise.all([
      course.apply_assignment_group_weights
        ? canvasList(
            baseUrl,
            `${base}/assignment_groups?per_page=100`,
            token,
            canvasGroupSchema,
            options,
          )
        : Promise.resolve([]),
      canvasList(
        baseUrl,
        `${base}/assignments?include[]=submission&order_by=due_at&per_page=100`,
        token,
        canvasAssignmentSchema,
        options,
      ),
    ]);
    out.push(toSyncCourse(course, groups, assignments));
  }
  return out;
}
