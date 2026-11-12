import { describe, expect, it } from "vitest";

import { exportCards, toAnkiCsv, toQuizletTsv } from "./index.ts";

const cards = [
  { front: "Mitochondria", back: "The powerhouse\nof the cell", tags: ["bio 201", "unit-2"] },
  { front: 'Define "osmosis"', back: "Water moves across a membrane, <high> to low", tags: [] },
];

describe("toAnkiCsv", () => {
  it("writes import headers and quoted, HTML-safe fields", () => {
    expect(toAnkiCsv(cards, "BIO 201")).toBe(
      [
        "#separator:Comma",
        "#html:true",
        "#deck:BIO 201",
        "#notetype:Basic",
        "#columns:Front,Back,Tags",
        "#tags column:3",
        '"Mitochondria","The powerhouse<br>of the cell","bio_201 unit-2"',
        '"Define ""osmosis""","Water moves across a membrane, &lt;high&gt; to low",""',
        "",
      ].join("\n"),
    );
  });
});

describe("toQuizletTsv", () => {
  it("writes one tab-separated card per line with no tabs or newlines inside fields", () => {
    const tsv = toQuizletTsv([...cards, { front: "a\tb", back: "c" }]);
    expect(tsv).toBe(
      'Mitochondria\tThe powerhouse of the cell\nDefine "osmosis"\tWater moves across a membrane, <high> to low\na b\tc\n',
    );
    expect(
      tsv
        .trim()
        .split("\n")
        .every((line) => line.split("\t").length === 2),
    ).toBe(true);
  });

  it("is empty for no cards", () => {
    expect(toQuizletTsv([])).toBe("");
  });
});

describe("exportCards", () => {
  it("picks the content type and extension by format", () => {
    expect(exportCards(cards, "quizlet", "x")).toMatchObject({
      extension: "tsv",
      contentType: expect.stringContaining("tab-separated") as string,
    });
    expect(exportCards(cards, "anki", "x").extension).toBe("csv");
  });
});
