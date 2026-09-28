// Minimal HTML-to-text conversion for syllabus web pages. Keeps block structure
// (paragraphs, list items, table rows) as line breaks so dates stay next to their
// assignment names; drops scripts, styles, navigation chrome, and markup.

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "-",
  mdash: "-",
  lsquo: "'",
  rsquo: "'",
  ldquo: '"',
  rdquo: '"',
  hellip: "...",
  bull: "-",
  middot: "-",
  copy: "(c)",
  reg: "(R)",
  trade: "(TM)",
  deg: "°",
  frac12: "1/2",
  frac14: "1/4",
  frac34: "3/4",
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (match, entity: string) => {
    if (entity.startsWith("#")) {
      const code =
        entity[1] === "x" || entity[1] === "X"
          ? parseInt(entity.slice(2), 16)
          : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : match;
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

const DROP_ELEMENTS = [
  "script",
  "style",
  "noscript",
  "template",
  "svg",
  "canvas",
  "iframe",
  "head",
  "nav",
  "footer",
  "form",
  "button",
  "select",
];
const BLOCK_ELEMENTS =
  "address|article|aside|blockquote|dd|details|div|dl|dt|fieldset|figcaption|figure|h[1-6]|header|hr|main|ol|p|pre|section|summary|table|tbody|thead|tfoot|ul|caption";

export function htmlToText(html: string): string {
  let s = html.replace(/<!--[\s\S]*?-->/g, " ");
  for (const tag of DROP_ELEMENTS) {
    s = s.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, "gi"), " ");
  }
  s = s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<\/(td|th)\s*>/gi, " | ")
    .replace(/<\/tr\s*>/gi, "\n")
    .replace(new RegExp(`<\\/?(${BLOCK_ELEMENTS})\\b[^>]*>`, "gi"), "\n")
    .replace(/<[^>]+>/g, " ");
  s = decodeEntities(s);
  return s
    .split("\n")
    .map((line) =>
      line
        .replace(/[ \t\u00a0]+/g, " ")
        .replace(/\s*\|\s*$/, "")
        .trim(),
    )
    .filter((line, i, lines) => line !== "" || (i > 0 && lines[i - 1] !== ""))
    .join("\n")
    .trim();
}

/** Pulls the <title> for use as a fallback course name hint. */
export function htmlTitle(html: string): string | null {
  const match = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return match?.[1] ? decodeEntities(match[1]).replace(/\s+/g, " ").trim() || null : null;
}
