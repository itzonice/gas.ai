// Turns the model's raw extraction into the stored ParseResult.
import {
  DEFAULT_DUE_TIME,
  dedupeAssignments,
  isInTerm,
  toUtc,
  type DatedAssignment,
} from "./dates.ts";
import type { AiSyllabusV1 } from "./prompts/v1/schema.ts";
import type { DroppedAssignment, ParseResult, ParseWarning, ParsedAssignment } from "./result.ts";

export interface PostProcessContext {
  timezone: string;
  promptVersion: string;
  model: string;
  /** Term dates the student entered; they take precedence over the syllabus. */
  termStartHint?: string | null;
  termEndHint?: string | null;
}

function toParsedAssignment(a: DatedAssignment): ParsedAssignment {
  return {
    title: a.title.trim(),
    kind: a.kind,
    category_name: a.category_name,
    original_category_name: a.category_name,
    due_at: a.due_at,
    due_date_local: a.due_date,
    // The effective local time; flags.default_time says whether it was assumed.
    due_time_local: a.due_date ? (a.due_time ?? DEFAULT_DUE_TIME) : null,
    points_possible: a.points_possible,
    flags: {
      inferred_date: a.inferred_date,
      inferred_year: a.inferred_year,
      expanded_recurring: a.expanded_recurring,
      tbd: a.tbd || !a.due_date,
      default_time: a.default_time,
      category_unmatched: false,
    },
    confidence: "high",
    source_quote: a.source_quote.slice(0, 300),
  };
}

export function postProcess(output: AiSyllabusV1, ctx: PostProcessContext): ParseResult {
  const warnings: ParseWarning[] = output.warnings.map((message) => ({
    code: "model_note",
    message,
  }));
  const dropped: DroppedAssignment[] = [];
  const term = {
    start: ctx.termStartHint ?? output.course.term_start,
    end: ctx.termEndHint ?? output.course.term_end,
  };

  // 1. Local dates -> UTC instants, defaulting missing times to end of day.
  const dated = output.assignments.map((a) => toUtc(a, ctx.timezone));

  // 2. Drop items dated outside the term (with a grace window).
  const inTerm = dated.filter((a) => {
    if (!a.due_date || isInTerm(a.due_date, term)) return true;
    dropped.push({ title: a.title, due_date_local: a.due_date, reason: "outside_term" });
    return false;
  });
  const outside = dropped.length;
  if (outside > 0) {
    warnings.push({
      code: "dropped_outside_term",
      message: `${String(outside)} item${outside === 1 ? " was" : "s were"} dated outside the term and left out. Review them if the term dates look wrong.`,
    });
  }
  if (!term.start || !term.end) {
    warnings.push({
      code: "term_dates_missing",
      message: "The term dates weren't found. Add them so dates can be checked.",
    });
  }

  // 3. Remove duplicates.
  const { kept, dropped: duplicates } = dedupeAssignments(inTerm);
  dropped.push(...duplicates);

  const assignments = kept
    .map(toParsedAssignment)
    // Dated items in chronological order, TBD items last.
    .sort((a, b) => (a.due_at ?? "9999").localeCompare(b.due_at ?? "9999"));

  return {
    prompt_version: ctx.promptVersion,
    model: ctx.model,
    timezone: ctx.timezone,
    course: { ...output.course, term_start: term.start, term_end: term.end },
    categories: output.categories.map((c) => ({ ...c, name: c.name.trim() })),
    assignments,
    dropped,
    grading_scale: output.grading_scale,
    warnings,
  };
}
