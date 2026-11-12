import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { insertCardLine, prefixLines, wrapSelection } from "./editing.ts";

const sel = (text: string, start: number, end = start) => ({ text, start, end });

describe("wrapSelection", () => {
  it("wraps the selection and keeps it selected", () => {
    const r = wrapSelection(sel("make this bold now", 5, 9), "**", "bold");
    expect(r).toEqual({ text: "make **this** bold now", start: 7, end: 11 });
  });

  it("inserts a selected placeholder when nothing is selected", () => {
    const r = wrapSelection(sel("ab", 1), "*", "italic");
    expect(r.text).toBe("a*italic*b");
    expect(r.text.slice(r.start, r.end)).toBe("italic");
  });

  it("removes the marks from text that is already wrapped", () => {
    const r = wrapSelection(sel("a **bold** b", 4, 8), "**", "bold");
    expect(r).toEqual({ text: "a bold b", start: 2, end: 6 });
  });

  it("copes with a reversed or out-of-range selection", () => {
    expect(wrapSelection(sel("abc", 99, 1), "`", "code").text).toBe("a`bc`");
    expect(wrapSelection(sel("", -4, 8), "`", "code").text).toBe("`code`");
  });
});

describe("prefixLines", () => {
  it("prefixes every selected line, and toggles it off again", () => {
    const text = "one\ntwo\nthree";
    const on = prefixLines(sel(text, 0, 7), "- ");
    expect(on.text).toBe("- one\n- two\nthree");
    const off = prefixLines(sel(on.text, on.start, on.end), "- ");
    expect(off.text).toBe(text);
  });

  it("acts on the line holding the cursor", () => {
    expect(prefixLines(sel("one\ntwo\nthree", 5), "> ").text).toBe("one\n> two\nthree");
  });

  it("replaces a heading level instead of stacking", () => {
    expect(prefixLines(sel("## Title", 3), "# ").text).toBe("# Title");
    expect(prefixLines(sel("# Title", 0), "# ").text).toBe("Title");
  });

  it("does not take in the next line when the selection ends after a newline", () => {
    expect(prefixLines(sel("a\nb\nc", 0, 2), "- ").text).toBe("- a\nb\nc");
  });

  it("works on an empty note", () => {
    expect(prefixLines(sel("", 0), "- ")).toEqual({ text: "- ", start: 0, end: 2 });
  });
});

describe("insertCardLine", () => {
  it("adds a template on an empty line", () => {
    const r = insertCardLine(sel("", 0));
    expect(r.text).toBe("term :: definition");
    expect(r.text.slice(r.start, r.end)).toBe("definition");
  });

  it("uses the selected text as the term, starting a new line if needed", () => {
    const r = insertCardLine(sel("Notes: mitosis", 7, 14));
    expect(r.text).toBe("Notes: \nmitosis :: definition");
    expect(r.text.slice(r.start, r.end)).toBe("definition");
  });
});

describe("selection is always valid (property)", () => {
  it("never leaves the selection outside the text", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 60 }),
        fc.integer({ min: -5, max: 80 }),
        fc.integer({ min: -5, max: 80 }),
        (text, start, end) => {
          const results = [
            wrapSelection(sel(text, start, end), "**", "bold"),
            prefixLines(sel(text, start, end), "- "),
            insertCardLine(sel(text, start, end)),
          ];
          return results.every((r) => r.start >= 0 && r.start <= r.end && r.end <= r.text.length);
        },
      ),
    );
  });
});
