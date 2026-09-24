// The stored parse result (syllabus_uploads.parse_result): the model's extraction
// after post-processing. This is what the review screen shows and what
// commit_parsed_syllabus receives (possibly edited by the student).
import { z } from "zod";

import { ASSIGNMENT_KINDS } from "./prompts/v1/schema.ts";

export const assignmentFlagsSchema = z.object({
  /** Date computed from a week number, weekday, or class meeting, not printed. */
  inferred_date: z.boolean(),
  /** Month and day were printed but the year was inferred. */
  inferred_year: z.boolean(),
  /** Generated from a recurring rule such as "every Tuesday". */
  expanded_recurring: z.boolean(),
  /** No due date given (TBD/TBA). */
  tbd: z.boolean(),
  /** No due time given; defaulted to 23:59 local. */
  default_time: z.boolean(),
  /** category_name didn't match any extracted category. */
  category_unmatched: z.boolean(),
});

export const confidenceSchema = z.enum(["high", "medium", "low"]);

export const parsedAssignmentSchema = z.object({
  title: z.string().min(1).max(300),
  kind: z.enum(ASSIGNMENT_KINDS),
  /** Canonical category name from `categories`, or null. */
  category_name: z.string().nullable(),
  /** What the model wrote before matching, kept for the review screen. */
  original_category_name: z.string().nullable(),
  /** UTC instant, or null when there's no date. */
  due_at: z.iso.datetime({ offset: true }).nullable(),
  due_date_local: z.string().nullable(),
  due_time_local: z.string().nullable(),
  points_possible: z.number().positive().nullable(),
  flags: assignmentFlagsSchema,
  confidence: confidenceSchema,
  source_quote: z.string(),
});

export const droppedAssignmentSchema = z.object({
  title: z.string(),
  due_date_local: z.string().nullable(),
  reason: z.enum(["outside_term", "duplicate"]),
});

export const parseWarningSchema = z.object({
  code: z.string(),
  message: z.string(),
});

export const parsedCategorySchema = z.object({
  name: z.string().min(1).max(100),
  weight: z.number().min(0).max(100).nullable(),
  drop_lowest: z.number().int().min(0).nullable(),
});

export const parseResultSchema = z.object({
  prompt_version: z.string(),
  model: z.string(),
  timezone: z.string(),
  course: z.object({
    name: z.string(),
    code: z.string().nullable(),
    instructor: z.string().nullable(),
    term_start: z.string().nullable(),
    term_end: z.string().nullable(),
  }),
  categories: z.array(parsedCategorySchema),
  assignments: z.array(parsedAssignmentSchema),
  dropped: z.array(droppedAssignmentSchema),
  grading_scale: z.array(z.object({ letter: z.string(), min_percent: z.number().min(0).max(100) })),
  warnings: z.array(parseWarningSchema),
  /** Counts of confidence levels and flags, for the review screen header. */
  summary: z.object({
    total: z.number().int(),
    high: z.number().int(),
    medium: z.number().int(),
    low: z.number().int(),
    inferred_dates: z.number().int(),
    inferred_years: z.number().int(),
    expanded_recurring: z.number().int(),
    tbd: z.number().int(),
    default_times: z.number().int(),
    categories_unmatched: z.number().int(),
  }),
});

export type AssignmentFlags = z.infer<typeof assignmentFlagsSchema>;
export type ParsedAssignment = z.infer<typeof parsedAssignmentSchema>;
export type ParsedCategory = z.infer<typeof parsedCategorySchema>;
export type ParseResult = z.infer<typeof parseResultSchema>;
export type ParseWarning = z.infer<typeof parseWarningSchema>;
export type DroppedAssignment = z.infer<typeof droppedAssignmentSchema>;
