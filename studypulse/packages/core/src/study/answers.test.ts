import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  acceptedAnswers,
  checkAnswer,
  editDistance,
  isTypeable,
  normalizeAnswer,
  sameAnswer,
} from "./answers.ts";

describe("normalizeAnswer", () => {
  it("ignores capitals, accents, punctuation, extra spaces, and a leading article", () => {
    expect(normalizeAnswer("  The  Mitochondrion! ")).toBe("mitochondrion");
    expect(normalizeAnswer("Café")).toBe("cafe");
    expect(normalizeAnswer("F = m * a")).toBe("f m a");
    expect(normalizeAnswer("an  apple")).toBe("apple");
    expect(normalizeAnswer("the")).toBe("the");
    expect(normalizeAnswer("...")).toBe("");
  });
});

describe("checkAnswer", () => {
  it("accepts the answer however it's capitalized or accented", () => {
    expect(checkAnswer("Mitochondrion", "mitochondrion").verdict).toBe("correct");
    expect(checkAnswer("São Paulo", "sao paulo").verdict).toBe("correct");
    expect(checkAnswer("The Krebs cycle", "krebs cycle").verdict).toBe("correct");
  });

  it("forgives one small typo in a longer word, and says what it matched", () => {
    expect(checkAnswer("Mitochondrion", "mitocondrion")).toEqual({
      verdict: "close",
      matched: "Mitochondrion",
    });
    expect(checkAnswer("ribosome", "ribosmoe").verdict).toBe("close"); // swapped letters
    expect(checkAnswer("photosynthesis", "photosinthesis").verdict).toBe("close");
    expect(checkAnswer("photosynthesis", "fotosintesis").verdict).toBe("wrong");
  });

  it("is strict about short answers and numbers", () => {
    expect(checkAnswer("ATP", "ADP").verdict).toBe("wrong");
    expect(checkAnswer("cat", "bat").verdict).toBe("wrong");
    expect(checkAnswer("1945", "1946").verdict).toBe("wrong");
    expect(checkAnswer("World War 2", "World War 1").verdict).toBe("wrong");
    expect(checkAnswer("x = 12 meters", "x = 12 meter").verdict).toBe("close");
  });

  it("accepts any listed alternative and optional detail in brackets", () => {
    expect(checkAnswer("mitochondrion / mitochondria", "mitochondria").verdict).toBe("correct");
    expect(checkAnswer("car; automobile", "automobile").verdict).toBe("correct");
    expect(checkAnswer("ATP (adenosine triphosphate)", "atp").verdict).toBe("correct");
    expect(checkAnswer("ATP (adenosine triphosphate)", "adenosine triphosphate").verdict).toBe(
      "correct",
    );
    expect(checkAnswer("soda or pop", "pop").verdict).toBe("correct");
    expect(acceptedAnswers("km/h")).toEqual(["km/h"]);
    expect(acceptedAnswers("Paris, France")).toEqual(["Paris, France"]);
  });

  it("treats an empty answer as wrong", () => {
    expect(checkAnswer("anything", "   ")).toEqual({ verdict: "wrong", matched: null });
    expect(checkAnswer("anything", "?!")).toEqual({ verdict: "wrong", matched: null });
  });

  it("always accepts the card's own answer (property)", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 60 }), (answer) => {
        fc.pre(normalizeAnswer(answer) !== "");
        return checkAnswer(answer, answer).verdict === "correct";
      }),
    );
  });
});

describe("editDistance", () => {
  it("counts inserts, deletes, replacements, and swaps", () => {
    expect(editDistance("", "abc")).toBe(3);
    expect(editDistance("kitten", "sitting")).toBe(3);
    expect(editDistance("ab", "ba")).toBe(1);
    expect(editDistance("same", "same")).toBe(0);
  });

  it("is symmetric and zero only for equal strings (property)", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 12 }), fc.string({ maxLength: 12 }), (a, b) => {
        const d = editDistance(a, b);
        return (
          d === editDistance(b, a) && (d === 0) === (a === b) && d <= Math.max(a.length, b.length)
        );
      }),
    );
  });
});

describe("helpers", () => {
  it("compares answers the way the checker does", () => {
    expect(sameAnswer("The Nucleus", "nucleus.")).toBe(true);
    expect(sameAnswer("nucleus", "nucleolus")).toBe(false);
  });

  it("only asks for typing when the answer is short", () => {
    expect(isTypeable("Golgi apparatus")).toBe(true);
    expect(isTypeable("Modifies, sorts, and packages proteins for the cell")).toBe(false);
    expect(isTypeable("...")).toBe(false);
  });
});
