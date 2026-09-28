import { describe, expect, it } from "vitest";

import { fakeClient } from "../parser/fake-client.ts";
import { exportCards } from "./index.ts";
import { cleanCards, generateCards, generateCardsInputSchema } from "./generate.ts";

const notes =
  "Mitochondria make ATP through oxidative phosphorylation. The electron transport chain " +
  "pumps protons into the intermembrane space; ATP synthase uses the gradient.";

describe("cleanCards", () => {
  it("trims, adds question marks, drops duplicates and empties, and caps the count", () => {
    const cards = cleanCards(
      {
        cards: [
          { question: " What makes ATP in the cell ", answer: "Mitochondria", topic: "Cells" },
          { question: "What makes ATP in the cell?", answer: "Duplicate", topic: null },
          { question: "", answer: "empty question", topic: null },
          { question: "Where are protons pumped?", answer: "  ", topic: null },
          { question: "What does ATP synthase use?", answer: "The proton gradient", topic: null },
          { question: "Extra one?", answer: "x", topic: null },
        ],
        skipped_reason: null,
      },
      2,
    );
    expect(cards).toEqual([
      { front: "What makes ATP in the cell?", back: "Mitochondria", tags: ["Cells"] },
      { front: "What does ATP synthase use?", back: "The proton gradient", tags: [] },
    ]);
  });
});

describe("generateCards", () => {
  it("sends the notes with the requested count and returns cleaned cards", async () => {
    const { client, calls } = fakeClient([
      {
        parsed: {
          cards: [
            {
              question: "How do mitochondria make ATP?",
              answer: "Oxidative phosphorylation",
              topic: "Energy",
            },
          ],
          skipped_reason: null,
        },
      },
    ]);
    const out = await generateCards(client, { notes, maxCards: 5, courseLabel: "BIO 201" });
    expect(out.cards).toHaveLength(1);
    expect(out.promptVersion).toBe("cards-v1");
    expect(out.usage.inputTokens).toBe(100);
    const call = calls[0] as { messages: { content: { text: string }[] }[]; system: unknown };
    const text = call.messages[0]?.content[0]?.text ?? "";
    expect(text).toContain("course: BIO 201");
    expect(text).toContain("cards_wanted: up to 5");
    expect(text).toContain(notes);
    // The generated cards go straight into the prompt-43 exports.
    expect(exportCards(out.cards, "quizlet", "Deck").body).toContain(
      "How do mitochondria make ATP?\tOxidative phosphorylation",
    );
  });

  it("explains an empty result", async () => {
    const { client } = fakeClient([{ parsed: { cards: [], skipped_reason: null } }]);
    const out = await generateCards(client, { notes });
    expect(out.cards).toEqual([]);
    expect(out.skippedReason).toBe("No testable ideas found in these notes.");
  });

  it("retries once on output that fails validation", async () => {
    const { client, calls } = fakeClient([
      { parsed: { cards: "nope" } },
      { parsed: { cards: [], skipped_reason: "Only logistics" } },
    ]);
    const out = await generateCards(client, { notes });
    expect(calls).toHaveLength(2);
    expect(out.skippedReason).toBe("Only logistics");
  });

  it("validates the input", () => {
    expect(generateCardsInputSchema.safeParse({ notes: "too short" }).success).toBe(false);
    expect(generateCardsInputSchema.safeParse({ notes, maxCards: 21 }).success).toBe(false);
    expect(generateCardsInputSchema.parse({ notes }).maxCards).toBe(12);
  });
});
