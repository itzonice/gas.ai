import type { ParseResult } from "../parser/result.ts";
import type { EvalCase } from "./case.ts";

/** A perfect prediction built from the expected answers; must score 100%. */
export function expectedAsResult(c: EvalCase): Pick<ParseResult, "assignments" | "categories"> {
  return {
    categories: c.expected.categories.map((x) => ({
      name: x.name,
      weight: x.weight,
      drop_lowest: null,
    })),
    assignments: c.expected.assignments.map((a) => ({
      title: a.title,
      kind: a.kind ?? "assignment",
      category_name: a.category,
      original_category_name: a.category,
      due_at: null,
      due_date_local: a.due_date,
      due_time_local: a.due_time ?? (a.due_date ? "23:59" : null),
      points_possible: null,
      flags: {
        inferred_date: false,
        inferred_year: false,
        expanded_recurring: false,
        tbd: a.due_date === null,
        default_time: !a.due_time,
        category_unmatched: false,
      },
      confidence: "high",
      source_quote: "",
    })),
  };
}
