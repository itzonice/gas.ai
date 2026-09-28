import { describe, expect, it } from "vitest";

import { joinPages, needsOcr, normalizePageText, splitPages } from "./text.ts";

describe("normalizePageText", () => {
  it("fixes ligatures, quotes, bullets, and hyphenated line breaks", () => {
    const raw = "ﬁnal  exam — “Unit 3”\n• Assign-\nment 2 due\r\n\n\n\nNext";
    expect(normalizePageText(raw)).toBe('final exam - "Unit 3"\n- Assignment 2 due\n\nNext');
  });

  it("keeps dashes that are not line-break hyphenation", () => {
    expect(normalizePageText("Weeks 3-5\n- Quiz")).toBe("Weeks 3-5\n- Quiz");
  });
});

describe("joinPages / splitPages", () => {
  it("adds page markers and round-trips", () => {
    const text = joinPages(["Course info", "", "Schedule"]);
    expect(text).toBe("--- Page 1 ---\nCourse info\n\n--- Page 2 ---\n\n--- Page 3 ---\nSchedule");
    expect(splitPages(text)).toEqual([
      { page: 1, text: "Course info" },
      { page: 2, text: "" },
      { page: 3, text: "Schedule" },
    ]);
  });

  it("drops headers and footers repeated on most pages", () => {
    const pages = [1, 2, 3, 4].map(
      (n) =>
        `BIO 201 Syllabus\nWeek ${String(n)} topics\nLab ${String(n)} due Friday\nPage ${String(n)} of 4`,
    );
    expect(splitPages(joinPages(pages)).map((p) => p.text)).toEqual(
      [1, 2, 3, 4].map((n) => `Week ${String(n)} topics\nLab ${String(n)} due Friday`),
    );
  });

  it("keeps content lines that differ only by numbers", () => {
    const pages = [1, 2, 3].map((n) => `Unit ${String(n)}\nQuiz ${String(n)}`);
    expect(splitPages(joinPages(pages)).map((p) => p.text)).toEqual(pages);
  });

  it("treats unmarked text as a single page", () => {
    expect(splitPages("pasted text")).toEqual([{ page: 1, text: "pasted text" }]);
  });
});

describe("needsOcr", () => {
  const full = "Week 1: Introduction to cell biology and lab safety. ".repeat(10);
  it("is false for a normal text layer", () => {
    expect(needsOcr([full, full, full])).toBe(false);
  });
  it("is true for empty or near-empty text layers", () => {
    expect(needsOcr([])).toBe(true);
    expect(needsOcr(["", " ", "3"])).toBe(true);
    expect(needsOcr([full, "", "", "1"])).toBe(true);
  });
});
