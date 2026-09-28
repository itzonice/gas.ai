// Output schema for syllabus prompt v1: what the model returns, before post-processing.
// Dates are local calendar dates in the student's timezone; post-processing converts
// them to UTC timestamps. Changing this schema requires a new prompt version.
//
// Structured outputs can't enforce min/max or string patterns, so those constraints
// are validated client-side by zod after the response arrives.
import { z } from "zod";

export const ASSIGNMENT_KINDS = [
  "assignment",
  "quiz",
  "exam",
  "project",
  "reading",
  "lab",
  "discussion",
  "other",
] as const;

/** Date.parse accepts 2027-02-30 (rolling into March), so check the fields round-trip. */
function isRealCalendarDate(s: string): boolean {
  const [y, m, d] = s.split("-").map(Number);
  if (y === undefined || m === undefined || d === undefined) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
  .refine(isRealCalendarDate, "Invalid calendar date");
const localTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:MM (24-hour)");

export const aiCourseSchema = z.object({
  name: z.string().describe("Course title, e.g. 'Cell Biology'"),
  code: z.string().nullable().describe("Course code, e.g. 'BIO 201'"),
  instructor: z.string().nullable(),
  term_start: isoDate.nullable().describe("First day of the term (YYYY-MM-DD)"),
  term_end: isoDate.nullable().describe("Last day of the term, including finals (YYYY-MM-DD)"),
});

export const aiCategorySchema = z.object({
  name: z.string().describe("Grade category as named in the syllabus, e.g. 'Labs'"),
  weight: z.number().min(0).max(100).nullable().describe("Percent of the final grade, 0-100"),
  drop_lowest: z
    .number()
    .int()
    .min(0)
    .nullable()
    .describe("How many lowest scores are dropped, if stated"),
});

export const aiAssignmentSchema = z.object({
  title: z.string(),
  kind: z.enum(ASSIGNMENT_KINDS),
  category_name: z
    .string()
    .nullable()
    .describe("Exactly as written in the categories list, or null"),
  due_date: isoDate.nullable().describe("Local due date (YYYY-MM-DD); null if TBD or unknown"),
  due_time: localTime.nullable().describe("Local 24-hour due time (HH:MM); null if not stated"),
  points_possible: z.number().positive().nullable(),
  inferred_date: z
    .boolean()
    .describe("The date was computed (from a week number, 'next class', a weekday), not printed"),
  inferred_year: z.boolean().describe("The syllabus gave month and day but no year"),
  expanded_recurring: z
    .boolean()
    .describe("This item was generated from a recurring rule such as 'every Tuesday'"),
  tbd: z.boolean().describe("The syllabus says the date is TBD/TBA or gives none"),
  source_quote: z.string().describe("The syllabus text this item came from, max ~200 characters"),
});

export const aiLetterGradeSchema = z.object({
  letter: z.string(),
  min_percent: z.number().min(0).max(100),
});

export const aiSyllabusSchemaV1 = z.object({
  course: aiCourseSchema,
  categories: z.array(aiCategorySchema),
  assignments: z.array(aiAssignmentSchema),
  grading_scale: z
    .array(aiLetterGradeSchema)
    .describe("Letter grade cutoffs if listed, else empty"),
  warnings: z.array(z.string()).describe("Ambiguities the student should double-check"),
});

export type AiSyllabusV1 = z.infer<typeof aiSyllabusSchemaV1>;
export type AiAssignmentV1 = z.infer<typeof aiAssignmentSchema>;
