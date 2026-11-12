// Demo data for the App Store and Google Play review account (launch audit L1). Store
// reviewers sign in with it, so every screen has something real to show: three courses
// (the free plan's limit) mid-term, graded past work, work due over the next weeks, and
// two weeks of focus sessions. Dates are relative to `today`, so re-running
// scripts/seed-reviewer.mjs before each submission keeps the account current.
//
// Pure: the script does the writes with the service role.
import { addDays, zonedTimeToUtc, type IsoDate } from "../time/index.ts";

export const REVIEWER_TIMEZONE = "America/New_York";

type Kind = "assignment" | "quiz" | "exam" | "project" | "reading" | "lab" | "discussion" | "other";

interface CourseSpec {
  key: string;
  name: string;
  code: string;
  instructor: string;
  color: string;
  target: number;
  categories: [name: string, weight: number][];
  /** [category, title, kind, days from today, local HH:MM, points possible, earned, minutes] */
  work: [string, string, Kind, number, string, number | null, number | null, number][];
}

const COURSES: CourseSpec[] = [
  {
    key: "bio",
    name: "Cell Biology",
    code: "BIO 201",
    instructor: "Dr. Okafor",
    color: "#2E7D32",
    target: 90,
    categories: [
      ["Exams", 50],
      ["Labs", 25],
      ["Quizzes", 15],
      ["Participation", 10],
    ],
    work: [
      ["Quizzes", "Quiz 1: Membranes", "quiz", -35, "09:00", 20, 18, 60],
      ["Labs", "Lab 1: Microscopy", "lab", -30, "23:59", 50, 46, 120],
      ["Quizzes", "Quiz 2: Organelles", "quiz", -21, "09:00", 20, 15, 60],
      ["Labs", "Lab 2: Osmosis", "lab", -16, "23:59", 50, 44, 120],
      ["Exams", "Midterm Exam", "exam", -9, "10:00", 100, 84, 480],
      ["Labs", "Lab 3: Enzyme Kinetics", "lab", 0, "23:59", 50, null, 150],
      ["Quizzes", "Quiz 3: Cell Signaling", "quiz", 3, "09:00", 20, null, 60],
      ["Labs", "Lab 4: Mitosis", "lab", 20, "23:59", 50, null, 150],
      ["Exams", "Final Exam", "exam", 58, "08:00", 150, null, 720],
    ],
  },
  {
    key: "calc",
    name: "Calculus II",
    code: "MATH 221",
    instructor: "Prof. Lindqvist",
    color: "#1565C0",
    target: 85,
    categories: [
      ["Midterms", 40],
      ["Final Exam", 30],
      ["Problem Sets", 20],
      ["Quizzes", 10],
    ],
    work: [
      ["Quizzes", "Quiz 1: Integration by Parts", "quiz", -33, "11:00", 10, 9, 45],
      ["Problem Sets", "Problem Set 1", "assignment", -28, "23:59", 30, 28, 180],
      ["Problem Sets", "Problem Set 2", "assignment", -21, "23:59", 30, 24, 180],
      ["Midterms", "Midterm 1", "exam", -10, "11:00", 100, 72, 540],
      ["Problem Sets", "Problem Set 3", "assignment", -7, "23:59", 30, 26, 180],
      ["Problem Sets", "Problem Set 4", "assignment", 1, "23:59", 30, null, 180],
      ["Quizzes", "Quiz 2: Series Convergence", "quiz", 4, "11:00", 10, null, 45],
      ["Midterms", "Midterm 2", "exam", 12, "11:00", 100, null, 600],
      ["Final Exam", "Final Exam", "exam", 60, "14:00", 200, null, 900],
    ],
  },
  {
    key: "hist",
    name: "Modern World History",
    code: "HIST 110",
    instructor: "Dr. Ramírez",
    color: "#8E24AA",
    target: 88,
    categories: [
      ["Essays", 40],
      ["Midterm", 20],
      ["Final Exam", 25],
      ["Reading Responses", 15],
    ],
    work: [
      ["Reading Responses", "Response 1: Industrialization", "discussion", -31, "23:59", 10, 9, 60],
      ["Essays", "Essay 1: Causes of WWI", "project", -17, "23:59", 100, 88, 600],
      ["Reading Responses", "Response 2: Interwar Period", "discussion", -10, "23:59", 10, 8, 60],
      ["Midterm", "Midterm Exam", "exam", -3, "13:00", 100, null, 480],
      ["Reading Responses", "Response 3: Decolonization", "discussion", 2, "23:59", 10, null, 60],
      ["Essays", "Essay 2: Cold War Primary Sources", "project", 18, "23:59", 100, null, 720],
      ["Final Exam", "Final Exam", "exam", 59, "09:00", 100, null, 600],
    ],
  },
];

export interface ReviewerDemo {
  courses: {
    key: string;
    name: string;
    code: string;
    instructor: string;
    color: string;
    target_grade: number;
    term_start: IsoDate;
    term_end: IsoDate;
  }[];
  categories: { course: string; name: string; weight: number; position: number }[];
  assignments: {
    course: string;
    category: string;
    title: string;
    kind: Kind;
    due_at: string;
    status: "todo" | "in_progress" | "done";
    points_possible: number | null;
    points_earned: number | null;
    estimated_minutes: number;
  }[];
  /** Focus sessions, each tied to the assignment (by course and title) it was for. */
  sessions: { course: string; title: string; started_at: string; ended_at: string }[];
}

export function reviewerDemo(today: IsoDate, timeZone = REVIEWER_TIMEZONE): ReviewerDemo {
  const at = (days: number, time: string) =>
    zonedTimeToUtc(addDays(today, days), time, timeZone).toISOString();

  const courses = COURSES.map((c) => ({
    key: c.key,
    name: c.name,
    code: c.code,
    instructor: c.instructor,
    color: c.color,
    target_grade: c.target,
    term_start: addDays(today, -42),
    term_end: addDays(today, 63),
  }));
  const categories = COURSES.flatMap((c) =>
    c.categories.map(([name, weight], position) => ({ course: c.key, name, weight, position })),
  );
  const assignments = COURSES.flatMap((c) =>
    c.work.map(([category, title, kind, days, time, possible, earned, minutes]) => ({
      course: c.key,
      category,
      title,
      kind,
      due_at: at(days, time),
      status:
        earned !== null || days < 0
          ? ("done" as const)
          : days <= 3
            ? ("in_progress" as const)
            : ("todo" as const),
      points_possible: possible,
      points_earned: earned,
      estimated_minutes: minutes,
    })),
  );

  // The last 14 days, one or two sessions on most days, on whatever was due next.
  const sessions: ReviewerDemo["sessions"] = [];
  for (let back = 1; back <= 14; back++) {
    if (back % 6 === 0) continue; // a couple of rest days
    const count = back % 2 === 0 ? 1 : 2;
    for (let n = 0; n < count; n++) {
      const spec = COURSES[(back + n) % COURSES.length];
      if (!spec) continue;
      const next = spec.work.find(([, , , days]) => days > -back);
      if (!next) continue;
      const minutes = 30 + ((back * 17 + n * 23) % 5) * 15;
      const start = zonedTimeToUtc(addDays(today, -back), `${String(16 + n * 3)}:00`, timeZone);
      sessions.push({
        course: spec.key,
        title: next[1],
        started_at: start.toISOString(),
        ended_at: new Date(start.getTime() + minutes * 60_000).toISOString(),
      });
    }
  }
  return { courses, categories, assignments, sessions };
}
