// Turns the model's raw extraction into the stored ParseResult.
import { assignmentConfidence, summarizeConfidence } from "./confidence.ts";
import { matchCategory, weightWarnings } from "./categories.ts";
import {
  DEFAULT_DUE_TIME,
  dedupeAssignments,
  isInTerm,
  toUtc,
  type DatedAssignment,
} from "./dates.ts";
import type { AiSyllabus } from "./prompts/index.ts";
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

export function postProcess(output: AiSyllabus, ctx: PostProcessContext): ParseResult {
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

  // 4. Match category names to the extracted categories; unmatched become null + flag.
  const categories = output.categories.map((c) => ({ ...c, name: c.name.trim() }));
  let unmatched = 0;
  const assignments = kept
    .map(toParsedAssignment)
    .map((a) => {
      if (!a.original_category_name) return a;
      const match = matchCategory(a.original_category_name, categories);
      if (match.name) return { ...a, category_name: match.name };
      unmatched++;
      return { ...a, category_name: null, flags: { ...a.flags, category_unmatched: true } };
    })
    // Dated items in chronological order, TBD items last.
    .sort((a, b) => (a.due_at ?? "9999").localeCompare(b.due_at ?? "9999"));

  // 5. Confidence per item, from its flags.
  const termKnown = Boolean(term.start && term.end);
  const scored = assignments.map((a) => ({
    ...a,
    confidence: assignmentConfidence(a.flags, { termKnown }),
  }));
  const summary = summarizeConfidence(scored);
  if (summary.low > 0) {
    warnings.push({
      code: "low_confidence_items",
      message: `${String(summary.low)} item${summary.low === 1 ? " needs" : "s need"} a closer look (no date, a calculated date, or no category).`,
    });
  }

  if (unmatched > 0) {
    warnings.push({
      code: "categories_unmatched",
      message: `${String(unmatched)} item${unmatched === 1 ? "" : "s"} couldn't be matched to a grade category. Pick one so it counts toward your grade.`,
    });
  }
  warnings.push(...weightWarnings(categories));

  // Class meetings: drop impossible times and duplicates.
  const meetings = [
    ...new Map(
      (output.meetings ?? [])
        .filter((m) => m.end_time > m.start_time)
        .map((m) => [`${m.weekday} ${m.start_time} ${m.kind}`, m] as const),
    ).values(),
  ].map((m) => {
    const location = m.location?.trim() ?? "";
    return { ...m, location: location === "" ? null : location };
  });
  if ((output.meetings ?? []).length > meetings.length) {
    warnings.push({
      code: "meetings_dropped",
      message:
        "Some class meeting times didn't make sense and were left out. Check your class schedule.",
    });
  }

  return {
    prompt_version: ctx.promptVersion,
    model: ctx.model,
    timezone: ctx.timezone,
    course: { ...output.course, term_start: term.start, term_end: term.end },
    categories,
    assignments: scored,
    dropped,
    grading_scale: output.grading_scale,
    meetings,
    warnings,
    summary,
  };
}
