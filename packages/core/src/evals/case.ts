// Eval case format: evals/syllabi/<id>/syllabus.txt + expected.json.
import { z } from "zod";

import { ASSIGNMENT_KINDS } from "../parser/prompts/v1/schema.ts";

export const expectedAssignmentSchema = z.object({
  title: z.string(),
  kind: z.enum(ASSIGNMENT_KINDS).optional(),
  /** Local due date, or null for TBD items. */
  due_date: z.string().nullable(),
  /** Local due time when the syllabus states one; omitted/null means "not checked". */
  due_time: z.string().nullable().optional(),
  category: z.string().nullable(),
});

export const evalCaseSchema = z.object({
  description: z.string(),
  tags: z.array(z.string()).default([]),
  input: z.object({
    timezone: z.string(),
    today: z.string(),
    term_start: z.string().nullable().default(null),
    term_end: z.string().nullable().default(null),
  }),
  expected: z.object({
    course: z.object({ name: z.string(), code: z.string().nullable() }),
    categories: z.array(z.object({ name: z.string(), weight: z.number() })),
    assignments: z.array(expectedAssignmentSchema),
  }),
});

export type EvalCase = z.infer<typeof evalCaseSchema>;
export type ExpectedAssignment = z.infer<typeof expectedAssignmentSchema>;
