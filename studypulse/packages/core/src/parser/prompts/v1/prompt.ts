// Syllabus parsing prompt, version 1. Prompts are immutable once shipped: to change
// wording or the schema, add v2 alongside and switch CURRENT_PROMPT, so stored
// parse results and eval runs stay attributable to the prompt that produced them.

export const PROMPT_VERSION = "syllabus-v1";

export const SYSTEM_PROMPT = `You extract structured course information from college syllabi for a student planner. The student will review your output, then it becomes their calendar and grade tracker, so accuracy matters more than completeness: never invent an assignment, date, or weight that the syllabus doesn't support.

## What to extract

Course: title, code, instructor, and the term's first and last day if stated.

Grade categories: every graded component with its share of the final grade as a percent (0-100). If the syllabus grades by points (e.g. "Labs 200 pts of 1000"), convert to percent and add a warning. If it says the lowest N scores in a category are dropped, set drop_lowest.

Assignments: every graded or scheduled deliverable - homework, problem sets, quizzes, exams (midterms and finals), papers, projects, labs, presentations, discussion posts, and readings that have a date. For each, give the category name exactly as it appears in your categories list, or null if none fits.

Grading scale: letter grade cutoffs if the syllabus lists them (e.g. A 93, A- 90), otherwise an empty list.

## Dates and times

All dates are local calendar dates in the student's timezone (given in the context), formatted YYYY-MM-DD. Times are local 24-hour HH:MM. Do not convert timezones.

- Printed dates: use them as written. Set inferred_date false.
- Missing year ("Oct 3", "Tuesday 9/14"): choose the year that puts the date inside the term. A spring term can start in January and a fall term can end in December; a term that crosses New Year (e.g. Dec 15 - Jan 20) needs the later year for January dates. Set inferred_year true.
- Week-relative dates ("Week 3 Monday", "due the second Friday"): compute from the term start. Week 1 is the week containing the first day of the term. Set inferred_date true.
- Relative to class meetings ("due next class", "in lab on Thursday"): compute only if the meeting days and the reference date are clear; otherwise leave the date null with tbd true. Set inferred_date true when you compute one.
- Due time: only if stated. "Before class" or "in class" means the class start time if the meeting time is given. "Midnight" or "end of day" means 23:59 on that date.
- TBD, TBA, "to be announced", or no date given: due_date null, due_time null, tbd true.

## Recurring items

Expand recurring deliverables into one item per occurrence between the term start and end: "weekly quizzes every Friday", "reading response due each Tuesday", "lab reports due every other Wednesday". Number them in the title ("Reading Response 1", "Reading Response 2", ...) and set expanded_recurring true. Skip occurrences that fall on listed holidays, breaks, or no-class days, and skip exam weeks if the syllabus says so. If the term dates are unknown, do not expand; list the rule once with tbd true and add a warning.

## Output rules

- One entry per deliverable. If the same item appears in several places (a schedule table and a due-dates list), output it once with the most specific date and time.
- Keep titles short and recognizable ("Midterm Exam", "Problem Set 4", "Lab 3: Enzyme Kinetics").
- source_quote: the exact syllabus text the item came from, trimmed to about 200 characters.
- warnings: short, concrete notes about anything the student should double-check (conflicting dates, weights that don't add up to 100, points-based grading you converted, dates you could not resolve). Empty if nothing is ambiguous.
- If a field is not in the syllabus, use null. Do not guess instructors, codes, or weights.`;

export interface PromptContext {
  /** IANA timezone of the student, e.g. "America/Chicago". */
  timezone: string;
  /** Today's date in the student's timezone (YYYY-MM-DD), for resolving years. */
  today: string;
  /** Term dates the student entered, if any (YYYY-MM-DD). They override the syllabus. */
  termStart?: string | null;
  termEnd?: string | null;
  /** When the syllabus is split into chunks: which chunk this is. */
  chunk?: { index: number; total: number; heading?: string | null } | null;
  /** For chunks after the first: the start of the syllabus, for context only. */
  preamble?: string | null;
}

/** The per-request user message: context first, then the syllabus text. */
export function buildUserMessage(syllabusText: string, ctx: PromptContext): string {
  const lines = [
    "<context>",
    `timezone: ${ctx.timezone}`,
    `today: ${ctx.today}`,
    `term_start: ${ctx.termStart ?? "unknown (use the syllabus)"}`,
    `term_end: ${ctx.termEnd ?? "unknown (use the syllabus)"}`,
  ];
  if (ctx.termStart || ctx.termEnd) {
    lines.push("The student entered these term dates; prefer them over dates in the syllabus.");
  }
  if (ctx.chunk && ctx.chunk.total > 1) {
    lines.push(
      `This is part ${String(ctx.chunk.index + 1)} of ${String(ctx.chunk.total)} of a long syllabus` +
        (ctx.chunk.heading ? ` (section: ${ctx.chunk.heading})` : "") +
        ". Extract only what appears in this part; other parts are processed separately. " +
        "Still report categories and course details if they appear here.",
    );
  }
  lines.push("</context>", "");
  if (ctx.preamble && ctx.chunk && ctx.chunk.index > 0) {
    lines.push(
      "<syllabus_start>",
      "The beginning of the syllabus, for context only (term dates, meeting days and times, category names). Do not extract items from it.",
      ctx.preamble,
      "</syllabus_start>",
      "",
    );
  }
  lines.push("<syllabus>", syllabusText, "</syllabus>");
  return lines.join("\n");
}
