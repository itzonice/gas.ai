import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  cardsFromNote,
  detectSeparator,
  MAX_IMPORT_CARDS,
  noteAsText,
  noteFileName,
  noteStats,
  noteTitle,
  parseCardImport,
  parseNoteBlocks,
  parseSpans,
  plainExcerpt,
  saveStateLabel,
  setSummary,
  wordCountLabel,
} from "./index.ts";

describe("parseCardImport", () => {
  it("reads Quizlet and spreadsheet exports (tab separated)", () => {
    const r = parseCardImport("Mitosis\tCell division\nMeiosis\tMakes gametes\n");
    expect(r.separator).toBe("tab");
    expect(r.cards).toEqual([
      { front: "Mitosis", back: "Cell division" },
      { front: "Meiosis", back: "Makes gametes" },
    ]);
    expect(r.skipped).toEqual([]);
  });

  it("detects other separators and splits only at the first one", () => {
    expect(parseCardImport("a :: b :: c").cards).toEqual([{ front: "a", back: "b :: c" }]);
    expect(parseCardImport("cat - a small pet\ndog - a loyal pet").separator).toBe("dash");
    expect(detectSeparator("x = 1\ny = 2")).toBe("equals");
    expect(detectSeparator("one,two\nthree,four")).toBe("comma");
    // A hyphen inside a word is not a separator.
    expect(parseCardImport("well-known\tfamous", { separator: "dash" }).skipped[0]?.reason).toBe(
      "no_separator",
    );
  });

  it("supports semicolons between cards and Windows line endings", () => {
    const r = parseCardImport("a\tb; c\td", { cardSeparator: "semicolon" });
    expect(r.cards).toHaveLength(2);
    expect(parseCardImport("a\tb\r\nc\td\r\n").cards).toHaveLength(2);
  });

  it("reports what it skipped and why, with line numbers", () => {
    const r = parseCardImport(
      [
        "good\tcard",
        "no separator here",
        "empty\t",
        "good\tcard",
        "x".repeat(2001) + "\tback",
        "",
      ].join("\n"),
      { separator: "tab" },
    );
    expect(r.cards).toEqual([{ front: "good", back: "card" }]);
    expect(r.skipped.map((s) => [s.line, s.reason])).toEqual([
      [2, "no_separator"],
      [3, "no_separator"],
      [4, "duplicate"],
      [5, "too_long"],
    ]);
  });

  it("skips a line with a separator but nothing on one side", () => {
    expect(parseCardImport("term ::").skipped.map((x) => x.reason)).toEqual(["empty_side"]);
    expect(parseCardImport(":: definition").skipped.map((x) => x.reason)).toEqual(["empty_side"]);
  });

  it("stops at the import limit", () => {
    const text = Array.from(
      { length: MAX_IMPORT_CARDS + 5 },
      (_, i) => `t${String(i)}\td${String(i)}`,
    ).join("\n");
    const r = parseCardImport(text);
    expect(r.cards).toHaveLength(MAX_IMPORT_CARDS);
    expect(r.skipped).toHaveLength(5);
    expect(r.skipped.every((s) => s.reason === "over_limit")).toBe(true);
  });

  it("never throws and never returns a blank side (property)", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 400 }), (text) => {
        const r = parseCardImport(text);
        return r.cards.every((c) => c.front.length > 0 && c.back.length > 0);
      }),
    );
  });
});

describe("notes", () => {
  it("titles a note by its title, first line, or 'Untitled note'", () => {
    expect(noteTitle({ title: " Lecture 1 ", body: "x" })).toBe("Lecture 1");
    expect(noteTitle({ title: "", body: "\n## Cell cycle\nmore" })).toBe("Cell cycle");
    expect(noteTitle({ title: "", body: "   " })).toBe("Untitled note");
  });

  it("removes formatting marks from an excerpt", () => {
    expect(
      plainExcerpt("# Cell signaling Cells talk with **chemical** signals. - [ ] Reread *11.3*"),
    ).toBe("Cell signaling Cells talk with chemical signals. Reread 11.3");
    expect(plainExcerpt("> a quote and a_snake_case word")).toBe("a quote and a_snake_case word");
  });

  it("counts words and finds card lines", () => {
    expect(noteStats("")).toEqual({ words: 0, characters: 0, cardLines: 0 });
    expect(noteStats("one two\nthree :: four").words).toBe(5);
    expect(wordCountLabel(1)).toBe("1 word");
    expect(wordCountLabel(2)).toBe("2 words");
  });

  it("makes cards from 'term :: definition' lines and Q:/A: pairs, no AI", () => {
    const body = [
      "# Cells",
      "Ligand :: binds a receptor",
      "- Kinase :: adds a phosphate",
      "Q: What does ATP store?",
      "A: Energy",
      "Q: Unanswered question",
      "Some other line",
      "ligand :: binds a receptor",
      "Q. Where is DNA?",
      "A. In the nucleus",
    ].join("\n");
    expect(cardsFromNote(body)).toEqual([
      { front: "Ligand", back: "binds a receptor" },
      { front: "Kinase", back: "adds a phosphate" },
      { front: "What does ATP store?", back: "Energy" },
      { front: "Where is DNA?", back: "In the nucleus" },
    ]);
  });

  it("parses inline marks without ever producing markup", () => {
    expect(parseSpans("a **b** *c* _d_ `e` f")).toEqual([
      { type: "text", text: "a " },
      { type: "bold", text: "b" },
      { type: "text", text: " " },
      { type: "italic", text: "c" },
      { type: "text", text: " " },
      { type: "italic", text: "d" },
      { type: "text", text: " " },
      { type: "code", text: "e" },
      { type: "text", text: " f" },
    ]);
    const spans = parseSpans("<img src=x onerror=alert(1)> **<b>**");
    expect(spans.map((s) => s.text).join("")).toContain("<img src=x onerror=alert(1)>");
    expect(spans.every((s) => ["text", "bold", "italic", "code"].includes(s.type))).toBe(true);
  });

  it("splits a note into blocks", () => {
    const blocks = parseNoteBlocks(
      [
        "# Title",
        "",
        "First line",
        "second line",
        "",
        "1. one",
        "2. two",
        "- a",
        "- [ ] todo",
        "- [x] done",
        "term :: def",
        "> quote",
        "---",
      ].join("\n"),
    );
    expect(blocks.map((b) => b.type)).toEqual([
      "heading",
      "paragraph",
      "list",
      "list",
      "checklist",
      "card",
      "quote",
      "divider",
    ]);
    expect(blocks[1]).toMatchObject({ spans: [{ type: "text", text: "First line second line" }] });
    expect(blocks[4]).toMatchObject({ items: [{ done: false }, { done: true }] });
  });

  it("downloads as a text file with a safe name", () => {
    expect(noteAsText({ title: "Week 1", body: "Hello\n\n" })).toBe("Week 1\n\nHello\n");
    expect(noteFileName({ title: "Lecture 9: Cell signaling / receptors?", body: "" })).toBe(
      "Lecture-9-Cell-signaling-receptors.txt",
    );
    expect(noteFileName({ title: "???", body: "" })).toBe("note.txt");
  });
});

describe("wording", () => {
  it("summarises a set", () => {
    expect(setSummary({ cards: 0, due: 0, fresh: 0 })).toBe("No cards yet");
    expect(setSummary({ cards: 24, due: 6, fresh: 10 })).toBe("24 cards · 6 due · 10 new");
    expect(setSummary({ cards: 1, due: 0, fresh: 0 })).toBe("1 card");
  });

  it("labels the save state in words", () => {
    expect(saveStateLabel({ status: "saved", at: new Date() })).toBe("Saved");
    expect(saveStateLabel({ status: "error", message: "offline" })).toBe("Not saved: offline");
    expect(saveStateLabel({ status: "idle" })).toBe("");
  });
});
