import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  answerLearn,
  buildTest,
  continueLearn,
  createMatch,
  gradeResponse,
  gradeTest,
  learnSummary,
  makeQuestion,
  matchDone,
  overrideLearn,
  seededRng,
  selectTile,
  shuffle,
  startLearn,
  type LearnState,
  type Question,
  type StudyCard,
} from "./index.ts";

const cards: StudyCard[] = [
  { id: "c1", front: "Mitochondrion", back: "Makes ATP" },
  { id: "c2", front: "Ribosome", back: "Builds proteins" },
  { id: "c3", front: "Nucleus", back: "Holds DNA" },
  { id: "c4", front: "Golgi", back: "Packages proteins" },
  { id: "c5", front: "Lysosome", back: "Digests waste" },
];

/** Moves on from an answer; between rounds, also starts the next round. */
function advance(state: LearnState, rng: () => number): LearnState {
  let next = continueLearn(state, rng);
  if (next.roundComplete && !next.done) next = continueLearn(next, rng);
  return next;
}

/** The response that answers a question correctly. */
function right(q: Question): string | boolean {
  if (q.type === "choice") return q.correctOptionId;
  if (q.type === "truefalse") return q.isTrue;
  if (q.type === "selfcheck") return true;
  return q.answer;
}
function wrong(q: Question): string | boolean {
  if (q.type === "choice") return q.options.find((o) => o.id !== q.correctOptionId)!.id;
  if (q.type === "truefalse") return !q.isTrue;
  if (q.type === "selfcheck") return false;
  return "definitely not it";
}

describe("shuffle", () => {
  it("keeps every item exactly once and doesn't change its input", () => {
    fc.assert(
      fc.property(fc.array(fc.integer(), { maxLength: 30 }), fc.integer(), (items, seed) => {
        const copy = [...items];
        const out = shuffle(items, seededRng(seed));
        return (
          JSON.stringify(items) === JSON.stringify(copy) &&
          JSON.stringify([...out].sort()) === JSON.stringify([...items].sort())
        );
      }),
    );
  });
});

describe("questions", () => {
  it("multiple choice has one right option and distinct wrong ones", () => {
    for (let seed = 0; seed < 50; seed++) {
      const q = makeQuestion("choice", cards[0]!, cards, "back", seededRng(seed));
      expect(q.type).toBe("choice");
      if (q.type !== "choice") continue;
      expect(q.options).toHaveLength(4);
      expect(new Set(q.options.map((o) => o.text)).size).toBe(4);
      expect(q.options.filter((o) => o.id === q.correctOptionId)).toHaveLength(1);
      expect(q.prompt).toBe("Mitochondrion");
      expect(gradeResponse(q, q.correctOptionId).correct).toBe(true);
    }
  });

  it("never offers an option that is also a right answer", () => {
    const dup: StudyCard[] = [
      { id: "a", front: "Heart", back: "Pumps blood" },
      { id: "b", front: "Cardiac muscle", back: "pumps blood!" },
      { id: "c", front: "Lung", back: "Exchanges gases" },
    ];
    for (let seed = 0; seed < 30; seed++) {
      const q = makeQuestion("choice", dup[0]!, dup, "back", seededRng(seed));
      if (q.type !== "choice") throw new Error("expected choice");
      expect(q.options.map((o) => o.id)).not.toContain("b");
    }
  });

  it("falls back when the set can't support the type", () => {
    const one = [cards[0]!];
    expect(makeQuestion("choice", one[0]!, one, "back", seededRng(1)).type).toBe("written");
    expect(makeQuestion("truefalse", one[0]!, one, "back", seededRng(1)).type).toBe("written");
    const long: StudyCard = {
      id: "l",
      front: "Define osmosis",
      back: "The movement of water across a selectively permeable membrane toward higher solute",
    };
    expect(makeQuestion("choice", long, [long], "back", seededRng(1)).type).toBe("selfcheck");
    expect(makeQuestion("written", long, [long], "back", seededRng(1)).type).toBe("selfcheck");
  });

  it("can ask the other way round", () => {
    const q = makeQuestion("written", cards[0]!, cards, "front", seededRng(1));
    expect(q).toMatchObject({ prompt: "Makes ATP", answer: "Mitochondrion" });
  });

  it("grades each type", () => {
    const written = makeQuestion("written", cards[2]!, cards, "back", seededRng(1));
    expect(gradeResponse(written, "holds dna").correct).toBe(true);
    expect(gradeResponse(written, "something else").correct).toBe(false);
    expect(gradeResponse(written, null).correct).toBe(false);
    expect(gradeResponse(written, true).correct).toBe(false);
  });
});

describe("Learn", () => {
  const run = (pickAnswer: (q: Question, i: number) => string | boolean, seed = 7) => {
    const rng = seededRng(seed);
    let state: LearnState = startLearn(cards, { roundSize: 3 }, rng);
    let steps = 0;
    while (!state.done && steps++ < 500) {
      if (state.current) state = answerLearn(state, pickAnswer(state.current, steps));
      state = continueLearn(state, rng);
    }
    return { state, steps };
  };

  it("finishes with every card mastered when the student gets everything right", () => {
    const { state, steps } = run((q) => right(q));
    expect(state.done).toBe(true);
    expect(learnSummary(state)).toMatchObject({ total: 5, mastered: 5, remaining: 0 });
    expect(steps).toBeLessThan(40);
  });

  it("asks a card twice (choice, then typed) before it counts as mastered", () => {
    const rng = seededRng(3);
    let state = startLearn(cards.slice(0, 2), { roundSize: 2 }, rng);
    const seen: Record<string, string[]> = {};
    while (!state.done) {
      const q = state.current!;
      (seen[q.cardId] ??= []).push(q.type);
      state = advance(answerLearn(state, right(q)), rng);
    }
    for (const types of Object.values(seen)) expect(types).toEqual(["choice", "written"]);
  });

  it("sends a missed card back to the end of the round and records it once", () => {
    const rng = seededRng(5);
    let state = startLearn(cards, { roundSize: 3 }, rng);
    const first = state.current!;
    state = answerLearn(state, wrong(first));
    expect(state.feedback).toMatchObject({ correct: false, rating: "again", stage: 0 });
    expect(state.queue.at(-1)).toBe(first.cardId);
    // Missing it again doesn't record another "again".
    state = continueLearn(state, rng);
    while (state.current?.cardId !== first.cardId)
      state = advance(answerLearn(state, right(state.current!)), rng);
    state = answerLearn(state, wrong(state.current));
    expect(state.feedback?.rating).toBeNull();
  });

  it("rates mastering a card 'good', or 'hard' after a miss", () => {
    const rng = seededRng(11);
    let state = startLearn(cards.slice(0, 3), { roundSize: 3 }, rng);
    const ratings: Record<string, (string | null)[]> = {};
    let missedOnce = false;
    let guard = 0;
    while (!state.done && guard++ < 200) {
      const q = state.current!;
      const miss = !missedOnce;
      missedOnce = true;
      state = answerLearn(state, miss ? wrong(q) : right(q));
      (ratings[q.cardId] ??= []).push(state.feedback!.rating);
      state = advance(state, rng);
    }
    const all = Object.values(ratings).flat().filter(Boolean);
    expect(all.filter((r) => r === "again")).toHaveLength(1);
    expect(all.filter((r) => r === "hard")).toHaveLength(1);
    expect(all.filter((r) => r === "good")).toHaveLength(2);
  });

  it("'I was right' turns a wrong answer into a right one", () => {
    const rng = seededRng(2);
    let state = startLearn(cards, { roundSize: 3 }, rng);
    const q = state.current!;
    state = answerLearn(state, wrong(q));
    const queued = state.queue.length;
    state = overrideLearn(state);
    expect(state.feedback).toMatchObject({ correct: true, stage: 1 });
    expect(state.queue.length).toBe(queued - 1);
    expect(state.progress[q.cardId]).toEqual({ stage: 1, misses: 0 });
    expect(overrideLearn(state)).toBe(state); // nothing left to override
  });

  it("ignores answers while feedback is showing, and cards with an empty side", () => {
    const rng = seededRng(4);
    let state = startLearn([...cards, { id: "e", front: "Empty", back: "  " }], {}, rng);
    expect(state.cards).toHaveLength(5);
    state = answerLearn(state, right(state.current!));
    expect(answerLearn(state, "again")).toBe(state);
    expect(startLearn([]).done).toBe(true);
  });

  it("always terminates, whatever the student does (property)", () => {
    fc.assert(
      fc.property(
        fc.array(fc.boolean(), { minLength: 1, maxLength: 60 }),
        fc.integer(),
        (picks, seed) => {
          const rng = seededRng(seed);
          let state = startLearn(cards, { roundSize: 2 }, rng);
          let i = 0;
          while (!state.done && i < 600) {
            const q = state.current!;
            state = advance(answerLearn(state, picks[i % picks.length] ? right(q) : wrong(q)), rng);
            i++;
          }
          // Wrong answers can repeat forever; once the student starts getting them right it ends.
          while (!state.done && i < 1200) {
            state = advance(answerLearn(state, right(state.current!)), rng);
            i++;
          }
          return state.done && learnSummary(state).mastered === 5;
        },
      ),
      { numRuns: 60 },
    );
  });
});

describe("Test", () => {
  it("builds the asked number of questions from distinct cards, dealing the types in turn", () => {
    const rng = seededRng(9);
    const questions = buildTest(
      cards,
      { count: 4, types: ["choice", "truefalse", "written"] },
      rng,
    );
    expect(questions.map((q) => q.type)).toEqual(["choice", "truefalse", "written", "choice"]);
    expect(new Set(questions.map((q) => q.cardId)).size).toBe(4);
  });

  it("caps the count at the cards and at 50, and never makes a self-check", () => {
    const many = Array.from({ length: 80 }, (_, i) => ({
      id: `m${String(i)}`,
      front: `term ${String(i)}`,
      back: `definition number ${String(i)}`,
    }));
    expect(buildTest(many, { count: 500 }, seededRng(1))).toHaveLength(50);
    expect(buildTest(cards, { count: 20 }, seededRng(1))).toHaveLength(5);
    const long = [
      {
        id: "x",
        front: "Q",
        back: "an extremely long answer that is far too long to be typed out by anyone at all",
      },
    ];
    expect(buildTest(long, { types: ["written"] }, seededRng(1))[0]?.type).toBe("written");
  });

  it("scores answers and lists what was typed", () => {
    const questions = buildTest(cards, { count: 5, types: ["choice"] }, seededRng(3));
    const responses = questions.map((q, i) => (i < 3 ? right(q) : i === 3 ? wrong(q) : null));
    const score = gradeTest(questions, responses);
    expect(score).toMatchObject({ correct: 3, total: 5, percent: 60 });
    expect(score.results[3]!.responseText).not.toBe("No answer");
    expect(score.results[4]!.responseText).toBe("No answer");
    expect(gradeTest([], []).percent).toBe(0);
  });

  it("scores a true-or-false and a written answer", () => {
    const q = buildTest(cards, { count: 2, types: ["truefalse", "written"] }, seededRng(8));
    const s = gradeTest(q, [right(q[0]!), "wrong text"]);
    expect(s.results[0]!.correct).toBe(true);
    expect(s.results[0]!.responseText).toMatch(/^(True|False)$/);
    expect(s.results[1]!.correct).toBe(false);
  });
});

describe("Match", () => {
  const pairs = createMatch(cards, seededRng(1), 4);

  it("lays out two tiles per card and never repeats text", () => {
    expect(pairs.tiles).toHaveLength(8);
    expect(new Set(pairs.tiles.map((t) => t.text)).size).toBe(8);
  });

  it("leaves out cards that would be ambiguous or don't fit", () => {
    const state = createMatch(
      [
        { id: "a", front: "Same", back: "One" },
        { id: "b", front: "same", back: "Two" },
        { id: "c", front: "Echo", back: "echo" },
        { id: "d", front: "x".repeat(200), back: "Long" },
        { id: "e", front: "Fine", back: "Good" },
      ],
      seededRng(1),
    );
    const ids = new Set(state.tiles.map((t) => t.cardId));
    expect(ids.has("c")).toBe(false);
    expect(ids.has("d")).toBe(false);
    expect(ids.has("a") && ids.has("b")).toBe(false);
  });

  it("matches a right pair, counts a wrong one, and finishes when all are paired", () => {
    let state = pairs;
    const [a, b] = [state.tiles[0]!, state.tiles.find((t) => t.cardId !== state.tiles[0]!.cardId)!];
    let r = selectTile(state, a.id);
    expect(r.event).toBe("selected");
    r = selectTile(r.state, a.id);
    expect(r.event).toBe("deselected");
    r = selectTile(r.state, a.id);
    r = selectTile(r.state, b.id);
    expect(r).toMatchObject({ event: "mismatch", state: { mistakes: 1, selected: null } });
    state = r.state;
    expect(state.lastMismatch).toEqual([a.id, b.id]);
    for (const tile of state.tiles) {
      if (state.matched.includes(tile.id)) continue;
      const partner = state.tiles.find((t) => t.cardId === tile.cardId && t.id !== tile.id)!;
      state = selectTile(selectTile(state, tile.id).state, partner.id).state;
    }
    expect(matchDone(state)).toBe(true);
    expect(state.mistakes).toBe(1);
    expect(selectTile(state, a.id).event).toBe("ignored");
  });
});
