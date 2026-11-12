// Normalizes extracted syllabus text into one string with explicit page markers,
// the input format every parser prompt expects:
//
//   --- Page 1 ---
//   BIO 201: Cell Biology
//   ...
//   --- Page 2 ---

export const pageMarker = (page: number) => `--- Page ${String(page)} ---`;
const PAGE_MARKER_RE = /^--- Page (\d+) ---$/m;

const LIGATURES: Record<string, string> = {
  ﬀ: "ff",
  ﬁ: "fi",
  ﬂ: "fl",
  ﬃ: "ffi",
  ﬄ: "ffl",
  ﬅ: "st",
  ﬆ: "st",
};

/** Cleans one page: unicode, whitespace, soft hyphens, and words split across lines. */
export function normalizePageText(text: string): string {
  let out = text.normalize("NFKC");
  out = out.replace(/[\ufb00-\ufb06]/g, (c) => LIGATURES[c] ?? c);
  out = out
    .replace(/\r\n?/g, "\n")
    .replace(/\u00ad/g, "") // soft hyphen
    .replace(/[\u200b-\u200d\ufeff]/g, "") // zero-width characters
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2022|\u25cf|\u25aa/g, "-") // bullets
    .replace(/\t/g, " ");
  // Rejoin words hyphenated across a line break ("assign-\nment"), but keep
  // dashes that start list items or ranges.
  out = out.replace(/([a-z])-\n([a-z])/g, "$1$2");
  out = out
    .split("\n")
    .map((line) => line.replace(/ {2,}/g, " ").trim())
    .join("\n");
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Drops header/footer lines repeated on most pages (course name banners, "Page 3 of
 * 10"), which otherwise look like content to the parser.
 */
function stripRepeatedLines(pages: string[]): string[] {
  if (pages.length < 3) return pages;
  // Page-number lines differ per page only by their digits, so compare them with the
  // digits masked; every other line must repeat exactly.
  const PAGE_NUMBER_LINE = /\bpage\s*\d+|^\s*\d+\s*((of|\/)\s*\d+)?\s*$/i;
  const key = (line: string) =>
    PAGE_NUMBER_LINE.test(line) ? line.toLowerCase().replace(/\d+/g, "#") : line.toLowerCase();
  const counts = new Map<string, number>();
  for (const page of pages) {
    const lines = page.split("\n");
    const edges = new Set([...lines.slice(0, 2), ...lines.slice(-2)].filter(Boolean).map(key));
    for (const k of edges) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const threshold = Math.ceil(pages.length * 0.6);
  const repeated = new Set([...counts].filter(([, n]) => n >= threshold).map(([k]) => k));
  if (repeated.size === 0) return pages;
  return pages.map((page) =>
    page
      .split("\n")
      .filter((line, i, lines) => {
        const atEdge = i < 2 || i >= lines.length - 2;
        return !(atEdge && repeated.has(key(line)));
      })
      .join("\n")
      .trim(),
  );
}

/** Joins normalized pages with page markers. Empty pages keep their marker. */
export function joinPages(pages: readonly string[]): string {
  const cleaned = stripRepeatedLines(pages.map(normalizePageText));
  return cleaned.map((text, i) => `${pageMarker(i + 1)}\n${text}`.trimEnd()).join("\n\n");
}

/** Splits page-marked text back into pages (1-based page numbers). */
export function splitPages(text: string): { page: number; text: string }[] {
  if (!PAGE_MARKER_RE.test(text)) return [{ page: 1, text: text.trim() }];
  const parts = text.split(/^--- Page (\d+) ---$/m);
  const pages: { page: number; text: string }[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    pages.push({ page: Number(parts[i]), text: (parts[i + 1] ?? "").trim() });
  }
  return pages;
}

/** Characters of real text (letters and digits) on a page. */
function meaningfulChars(text: string): number {
  return (text.match(/[\p{L}\p{N}]/gu) ?? []).length;
}

/**
 * True when a PDF's text layer is missing or too thin to trust, i.e. it is likely
 * scanned and needs OCR. Syllabi average well over 1,000 characters per page.
 */
export function needsOcr(pages: readonly string[]): boolean {
  if (pages.length === 0) return true;
  const perPage = pages.map(meaningfulChars);
  const total = perPage.reduce((a, b) => a + b, 0);
  const emptyPages = perPage.filter((n) => n < 40).length;
  return total / pages.length < 150 || emptyPages / pages.length > 0.5;
}
