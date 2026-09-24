// Splits long syllabi into section-aligned chunks and merges per-chunk results.
// A whole syllabus fits in the model's context; chunking bounds the size of each
// response (a long schedule can have hundreds of items) and lets chunks run in parallel.
import { categoryTokens } from "./categories.ts";
import type { AiSyllabusV1 } from "./prompts/v1/schema.ts";

/** Texts at or below this size are parsed in one call. */
export const CHUNK_THRESHOLD_CHARS = 40_000;
/** Target maximum size of one chunk. */
export const MAX_CHUNK_CHARS = 25_000;
/** How much of the start of the syllabus every chunk sees for context. */
export const PREAMBLE_CHARS = 3_000;

export interface SyllabusChunk {
  index: number;
  total: number;
  heading: string | null;
  text: string;
}

const PAGE_MARKER = /^--- Page \d+ ---$/;
const HEADING_WORDS =
  /^(course (information|description|schedule|calendar|policies|objectives)|schedule|calendar|tentative schedule|class schedule|grading|grades|evaluation|assessment|assignments|exams?|policies|required (texts?|materials)|textbooks?|office hours|weekly schedule|important dates|due dates|unit \d+|module \d+|week \d+|part [ivx\d]+)\b/i;

/** Heuristic: short lines that look like section titles. */
export function isHeading(line: string): boolean {
  const t = line.trim();
  if (t.length < 3 || t.length > 60 || PAGE_MARKER.test(t)) return false;
  // Sentences aren't headings ("Schedule changes will be announced in class.").
  if (/[.;,]$/.test(t) || t.split(/\s+/).length > 8) return false;
  if (HEADING_WORDS.test(t.replace(/^[\d.)\s#]+/, ""))) return true;
  // ALL CAPS lines with at least two letters and no sentence punctuation.
  if (
    /[A-Z]{2}/.test(t) &&
    t === t.toUpperCase() &&
    !/[.!?]$/.test(t) &&
    /^[A-Z0-9 &:/()'-]+$/.test(t)
  )
    return true;
  // Numbered headings: "1. Course Information", "III. Grading"
  return /^(\d{1,2}|[IVX]{1,4})[.)]\s+[A-Z][A-Za-z &/-]{2,60}$/.test(t);
}

interface Section {
  heading: string | null;
  lines: string[];
  size: number;
}

function splitSections(text: string): Section[] {
  const sections: Section[] = [];
  let current: Section = { heading: null, lines: [], size: 0 };
  // A section with only page markers and blank lines so far has no content yet.
  let hasContent = false;
  for (const line of text.split("\n")) {
    if (isHeading(line)) {
      if (hasContent) {
        sections.push(current);
        current = { heading: line.trim(), lines: [], size: 0 };
      } else {
        current.heading ??= line.trim();
      }
      hasContent = true;
    } else if (line.trim() && !PAGE_MARKER.test(line.trim())) {
      hasContent = true;
    }
    current.lines.push(line);
    current.size += line.length + 1;
  }
  if (current.lines.length) sections.push(current);
  return sections;
}

/** Splits an oversized section at line boundaries. */
function splitLarge(section: Section, max: number): Section[] {
  const parts: Section[] = [];
  let part: Section = { heading: section.heading, lines: [], size: 0 };
  for (const line of section.lines) {
    if (part.size + line.length + 1 > max && part.lines.length) {
      parts.push(part);
      part = {
        heading: section.heading ? `${section.heading} (continued)` : null,
        lines: [],
        size: 0,
      };
    }
    part.lines.push(line);
    part.size += line.length + 1;
  }
  if (part.lines.length) parts.push(part);
  return parts;
}

/**
 * Returns one chunk for short texts, otherwise section-aligned chunks of at most
 * ~maxChars each. The page marker in effect at a chunk boundary is repeated so each
 * chunk keeps its page context.
 */
export function chunkSyllabus(
  text: string,
  options: { threshold?: number; maxChars?: number } = {},
): SyllabusChunk[] {
  const { threshold = CHUNK_THRESHOLD_CHARS, maxChars = MAX_CHUNK_CHARS } = options;
  if (text.length <= threshold) return [{ index: 0, total: 1, heading: null, text }];

  const sections = splitSections(text).flatMap((s) =>
    s.size > maxChars ? splitLarge(s, maxChars) : [s],
  );
  const packed: Section[] = [];
  for (const section of sections) {
    const last = packed.at(-1);
    if (last && last.size + section.size <= maxChars) {
      last.lines.push(...section.lines);
      last.size += section.size;
    } else {
      packed.push({ heading: section.heading, lines: [...section.lines], size: section.size });
    }
  }

  let lastMarker: string | null = null;
  const chunks = packed.map((section, index) => {
    const first = section.lines.find((l) => l.trim() !== "");
    const needsMarker = lastMarker && !(first && PAGE_MARKER.test(first.trim()));
    const body = (needsMarker ? [lastMarker, ...section.lines] : section.lines).join("\n").trim();
    for (const line of section.lines) if (PAGE_MARKER.test(line.trim())) lastMarker = line.trim();
    return { index, total: packed.length, heading: section.heading, text: body };
  });
  return chunks;
}

/** The start of the syllabus (course info, term dates, meeting times), given to every chunk. */
export function syllabusPreamble(text: string, maxChars = PREAMBLE_CHARS): string {
  if (text.length <= maxChars) return text;
  const cut = text.lastIndexOf("\n", maxChars);
  return text.slice(0, cut > maxChars / 2 ? cut : maxChars);
}

const categoryKey = (name: string) => categoryTokens(name).join(" ") || name.toLowerCase().trim();

/**
 * Merges chunk results: course fields from the first chunk that has them, categories
 * unioned by normalized name (weighted entries win), assignments concatenated (dedupe
 * and category matching run later in postProcess), warnings de-duplicated.
 */
export function mergeChunkResults(results: readonly AiSyllabusV1[]): AiSyllabusV1 {
  const first = <T>(pick: (r: AiSyllabusV1) => T | null): T | null => {
    for (const r of results) {
      const v = pick(r);
      if (v !== null && v !== "") return v;
    }
    return null;
  };

  const warnings = new Set<string>();
  const categories = new Map<string, AiSyllabusV1["categories"][number]>();
  for (const r of results) {
    for (const c of r.categories) {
      const key = categoryKey(c.name);
      const existing = categories.get(key);
      if (!existing || (existing.weight === null && c.weight !== null)) {
        categories.set(key, { ...c, drop_lowest: c.drop_lowest ?? existing?.drop_lowest ?? null });
      } else if (c.weight !== null && existing.weight !== null && c.weight !== existing.weight) {
        warnings.add(
          `"${existing.name}" is listed as both ${String(existing.weight)}% and ${String(c.weight)}% in different sections.`,
        );
      }
    }
  }
  for (const r of results) r.warnings.forEach((w) => warnings.add(w));

  return {
    course: {
      name: first((r) => r.course.name) ?? "Untitled course",
      code: first((r) => r.course.code),
      instructor: first((r) => r.course.instructor),
      term_start: first((r) => r.course.term_start),
      term_end: first((r) => r.course.term_end),
    },
    categories: [...categories.values()],
    assignments: results.flatMap((r) => r.assignments),
    grading_scale: results.find((r) => r.grading_scale.length > 0)?.grading_scale ?? [],
    warnings: [...warnings],
  };
}
