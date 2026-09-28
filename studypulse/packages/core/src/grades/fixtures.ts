// Grade fixtures shared by TS and SQL. scripts/gen-grade-parity.ts renders them into
// supabase/tests/database/190_grade_parity.test.sql with TS results as expected values.
import type { GradeInput } from "./types.ts";

const item = (
  id: string,
  categoryId: string | null,
  earned: number | null,
  possible: number | null,
) => ({
  id,
  categoryId,
  pointsEarned: earned,
  pointsPossible: possible,
});

export const GRADE_FIXTURES: { name: string; input: GradeInput }[] = [
  {
    name: "weighted with an empty category",
    input: {
      categories: [
        { id: "exams", name: "Exams", weight: 50 },
        { id: "hw", name: "Homework", weight: 30 },
        { id: "quiz", name: "Quizzes", weight: 20 },
      ],
      assignments: [
        item("e1", "exams", 80, 100),
        item("h1", "hw", 10, 10),
        item("h2", "hw", 5, 10),
        item("q1", "quiz", null, 10),
      ],
    },
  },
  {
    name: "drop lowest two of five quizzes",
    input: {
      categories: [
        { id: "quiz", name: "Quizzes", weight: 40, dropLowest: 2 },
        { id: "exams", name: "Exams", weight: 60 },
      ],
      assignments: [
        item("q1", "quiz", 5, 10),
        item("q2", "quiz", 40, 100),
        item("q3", "quiz", 40, 50),
        item("q4", "quiz", 9, 10),
        item("q5", "quiz", 2, 20),
        item("e1", "exams", 70, 100),
      ],
    },
  },
  {
    name: "extra credit and zero-weight bonus",
    input: {
      categories: [
        { id: "hw", name: "Homework", weight: 100 },
        { id: "bonus", name: "Bonus", weight: 0 },
      ],
      assignments: [item("h1", "hw", 11, 10), item("h2", "hw", 8, 10), item("b", "bonus", 5, 5)],
    },
  },
  {
    name: "no categories",
    input: {
      categories: [],
      assignments: [item("a", null, 45, 50), item("b", null, 35, 50), item("c", null, null, 50)],
    },
  },
  {
    name: "weights not totalling 100",
    input: {
      categories: [
        { id: "a", name: "A", weight: 1 },
        { id: "b", name: "B", weight: 3, dropLowest: 1 },
      ],
      assignments: [item("1", "a", 100, 100), item("2", "b", 60, 100), item("3", "b", 10, 100)],
    },
  },
  {
    name: "nothing graded",
    input: {
      categories: [{ id: "a", name: "A", weight: 100 }],
      assignments: [item("1", "a", null, 100)],
    },
  },
];
