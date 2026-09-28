// Search across the student's courses and assignments (the app bar's search box). Every
// word must appear somewhere in the item's text; case and accents don't matter.

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

/** The search words, folded; empty for a blank query. */
export function searchTerms(query: string): string[] {
  return fold(query).split(/\s+/).filter(Boolean).slice(0, 10);
}

/** Whether every term appears in at least one of the fields. */
export function matches(terms: readonly string[], ...fields: (string | null | undefined)[]) {
  if (terms.length === 0) return false;
  const text = fold(fields.filter(Boolean).join(" "));
  return terms.every((t) => text.includes(t));
}
