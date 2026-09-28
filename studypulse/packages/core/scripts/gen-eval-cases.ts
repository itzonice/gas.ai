// Generates the 20 "standard" syllabus eval cases (evals/syllabi/std-*) with known
// answers. Deterministic: the same seed always produces the same files, so the
// dataset is reviewable in diffs. Hand-written tricky cases live in evals/syllabi/tricky-*.
// Run: pnpm --filter @studypulse/core eval:generate
import { mkdirSync, writeFileSync } from "node:fs";

import type { EvalCase, ExpectedAssignment } from "../src/evals/case.ts";
import { addDays, dayOfWeek } from "../src/time/index.ts";

function rng(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sept",
  "Oct",
  "Nov",
  "Dec",
];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const COURSES: [string, string, string][] = [
  ["Cell Biology", "BIO 201", "Dr. Amara Okafor"],
  ["Calculus II", "MATH 221", "Prof. Erik Lindqvist"],
  ["Modern World History", "HIST 110", "Dr. Lucia Ramírez"],
  ["Introduction to Psychology", "PSYC 101", "Prof. Wei Chen"],
  ["Organic Chemistry I", "CHEM 241", "Dr. Priya Natarajan"],
  ["Principles of Microeconomics", "ECON 201", "Prof. Daniel Mensah"],
  ["Data Structures", "CS 225", "Dr. Hannah Kowalski"],
  ["Introduction to Sociology", "SOC 100", "Prof. Marcus Bell"],
  ["Physics I: Mechanics", "PHYS 211", "Dr. Sofia Petrova"],
  ["English Composition", "ENG 102", "Prof. Grace Adeyemi"],
  ["Statistics for the Social Sciences", "STAT 200", "Dr. Kenji Watanabe"],
  ["American Government", "POLS 150", "Prof. Rachel Goldberg"],
  ["Human Anatomy", "BIOL 230", "Dr. Omar Haddad"],
  ["Linear Algebra", "MATH 240", "Prof. Ingrid Solberg"],
  ["Financial Accounting", "ACCT 210", "Dr. Thomas Nguyen"],
  ["Introduction to Philosophy", "PHIL 101", "Prof. Claire Dubois"],
  ["Environmental Science", "ENVS 120", "Dr. Mateo Silva"],
  ["Spanish II", "SPAN 102", "Prof. Isabel Moreno"],
  ["Discrete Mathematics", "CS 173", "Dr. Aisha Rahman"],
  ["Public Speaking", "COMM 110", "Prof. Jordan Blake"],
];

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Asia/Kolkata",
  "Australia/Sydney",
];

const TERMS: { name: string; start: string; end: string; today: string }[] = [
  { name: "Fall 2026", start: "2026-08-24", end: "2026-12-11", today: "2026-08-20" },
  { name: "Spring 2027", start: "2027-01-12", end: "2027-05-07", today: "2027-01-08" },
  { name: "Summer 2027", start: "2027-06-01", end: "2027-07-30", today: "2027-05-28" },
  { name: "Fall 2027", start: "2027-08-23", end: "2027-12-10", today: "2027-08-19" },
];

const CATEGORY_SETS: [string, number][][] = [
  [
    ["Exams", 50],
    ["Homework", 30],
    ["Quizzes", 20],
  ],
  [
    ["Midterm Exam", 25],
    ["Final Exam", 30],
    ["Problem Sets", 35],
    ["Participation", 10],
  ],
  [
    ["Essays", 40],
    ["Midterm", 20],
    ["Final Exam", 25],
    ["Reading Responses", 15],
  ],
  [
    ["Labs", 30],
    ["Exams", 45],
    ["Quizzes", 15],
    ["Participation", 10],
  ],
  [
    ["Projects", 40],
    ["Exams", 40],
    ["Homework", 20],
  ],
];

// What each category's items are called, and their kind.
const ITEM_STYLES: Record<
  string,
  { title: (n: number) => string; kind: ExpectedAssignment["kind"] }
> = {
  Exams: { title: (n) => `Exam ${String(n)}`, kind: "exam" },
  Homework: { title: (n) => `Homework ${String(n)}`, kind: "assignment" },
  Quizzes: { title: (n) => `Quiz ${String(n)}`, kind: "quiz" },
  "Midterm Exam": { title: () => "Midterm Exam", kind: "exam" },
  "Final Exam": { title: () => "Final Exam", kind: "exam" },
  "Problem Sets": { title: (n) => `Problem Set ${String(n)}`, kind: "assignment" },
  Participation: { title: () => "", kind: "other" },
  Essays: { title: (n) => `Essay ${String(n)}`, kind: "project" },
  Midterm: { title: () => "Midterm Exam", kind: "exam" },
  "Reading Responses": { title: (n) => `Reading Response ${String(n)}`, kind: "discussion" },
  Labs: { title: (n) => `Lab ${String(n)}`, kind: "lab" },
  Projects: { title: (n) => `Project ${String(n)}`, kind: "project" },
};

type Style = "table" | "list" | "prose" | "weekly";

function formatDate(date: string, style: number): string {
  const [, m = 1, d = 1] = date.split("-").map(Number);
  const dow = DAYS[dayOfWeek(date)] ?? "";
  switch (style % 5) {
    case 0:
      return `${MONTHS[m - 1] ?? ""} ${String(d)}`;
    case 1:
      return `${String(m)}/${String(d)}`;
    case 2:
      return `${dow.slice(0, 3)} ${String(m)}/${String(d)}`;
    case 3:
      return `${dow}, ${MONTHS_SHORT[m - 1] ?? ""} ${String(d)}`;
    default:
      return `${MONTHS[m - 1] ?? ""} ${String(d)}, ${date.slice(0, 4)}`;
  }
}

function formatTime(time: string): string {
  const [h = 0, min = 0] = time.split(":").map(Number);
  if (time === "23:59") return "11:59 PM";
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return min === 0
    ? `${String(h12)} ${suffix}`
    : `${String(h12)}:${String(min).padStart(2, "0")} ${suffix}`;
}

/** Next date on or after `from` that falls on a class-meeting weekday. */
function nextWeekday(from: string, weekdays: number[]): string {
  let d = from;
  while (!weekdays.includes(dayOfWeek(d))) d = addDays(d, 1);
  return d;
}

function buildCase(i: number): { id: string; syllabus: string; evalCase: EvalCase } {
  const r = rng(1000 + i);
  const at = <T>(xs: readonly T[], index: number): T => {
    const value = xs[index % xs.length];
    if (value === undefined) throw new Error("empty list");
    return value;
  };
  const pick = <T>(xs: readonly T[]): T => at(xs, Math.floor(r() * xs.length));
  const [courseName, code, instructor] = at(COURSES, i);
  const term = at(TERMS, i);
  const timezone = at(TIMEZONES, i);
  const categories = at(CATEGORY_SETS, i);
  const style = at<Style>(["table", "list", "prose", "weekly"], i);
  const dateStyle = Math.floor(r() * 5);
  const meets = pick([
    [1, 3],
    [2, 4],
    [1, 3, 5],
  ]);
  const termDays = Math.round((Date.parse(term.end) - Date.parse(term.start)) / 86_400_000);

  // Items per category, spread across the term.
  const items: (ExpectedAssignment & { sortKey: string })[] = [];
  for (const [cat] of categories) {
    const itemStyle = ITEM_STYLES[cat];
    if (!itemStyle || cat === "Participation") continue;
    const single = ["Midterm Exam", "Final Exam", "Midterm"].includes(cat);
    const count = single ? 1 : cat === "Exams" ? 2 + Math.floor(r() * 2) : 3 + Math.floor(r() * 4);
    for (let n = 1; n <= count; n++) {
      let offset: number;
      if (cat === "Final Exam") offset = termDays;
      else if (cat === "Midterm Exam" || cat === "Midterm") offset = Math.round(termDays / 2);
      else offset = Math.round((termDays - 7) * (n / (count + 0.5)));
      const onClassDay = itemStyle.kind === "exam" || itemStyle.kind === "quiz";
      let date = addDays(term.start, offset);
      if (onClassDay && cat !== "Final Exam") date = nextWeekday(date, meets);
      if (date > term.end) date = term.end;
      const time =
        itemStyle.kind === "exam"
          ? pick(["09:00", "10:30", "13:00", "14:00"])
          : r() < 0.6
            ? "23:59"
            : null;
      items.push({
        title: itemStyle.title(n),
        kind: itemStyle.kind,
        due_date: date,
        due_time: time,
        category: cat,
        sortKey: date,
      });
    }
  }
  items.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  const lines: string[] = [];
  const meetText = meets.map((d) => DAYS[d]).join("/");
  lines.push(
    `${code}: ${courseName}`,
    term.name,
    `Instructor: ${instructor}`,
    `Class meets ${meetText}.`,
  );
  lines.push(
    `First day of classes: ${formatDate(term.start, 4)}. Last day (including finals): ${formatDate(term.end, 4)}.`,
    "",
  );
  lines.push("GRADING");
  for (const [cat, weight] of categories)
    lines.push(
      style === "prose"
        ? `${cat} count for ${String(weight)}% of your grade.`
        : `${cat}: ${String(weight)}%`,
    );
  lines.push(
    "",
    "Late work loses 10% per day. Contact the instructor in advance for accommodations.",
    "",
  );

  const when = (a: ExpectedAssignment) => {
    const date = formatDate(a.due_date ?? "", dateStyle + items.indexOf(a as never));
    return a.due_time ? `${date} at ${formatTime(a.due_time)}` : date;
  };
  switch (style) {
    case "table":
      lines.push("SCHEDULE", "Date | Item | Category");
      for (const a of items) lines.push(`${when(a)} | ${a.title} | ${a.category ?? ""}`);
      break;
    case "list":
      lines.push("IMPORTANT DUE DATES");
      for (const a of items) lines.push(`- ${a.title} (${a.category ?? ""}) - due ${when(a)}`);
      break;
    case "prose":
      lines.push("ASSIGNMENTS AND EXAMS");
      for (const a of items) {
        lines.push(
          a.kind === "exam"
            ? `The ${a.title} will be held on ${when(a)}.`
            : `${a.title} is due ${when(a)}; it counts toward ${a.category ?? "your grade"}.`,
        );
      }
      break;
    case "weekly": {
      lines.push("WEEKLY SCHEDULE");
      let week = 1;
      for (let start = term.start; start <= term.end; start = addDays(start, 7), week++) {
        const end = addDays(start, 6);
        const due = items.filter((a) => a.due_date && a.due_date >= start && a.due_date <= end);
        lines.push(
          `Week ${String(week)} (${formatDate(start, 0)}): ${due.length ? due.map((a) => `${a.title} due ${when(a)}`).join("; ") : "No deliverables."}`,
        );
      }
      break;
    }
  }

  const id = `std-${String(i + 1).padStart(2, "0")}`;
  return {
    id,
    syllabus: `${lines.join("\n")}\n`,
    evalCase: {
      description: `${code} ${courseName}, ${term.name}, ${style} layout, ${timezone}`,
      tags: ["standard", style],
      input: { timezone, today: term.today, term_start: null, term_end: null },
      expected: {
        course: { name: courseName, code },
        categories: categories.map(([name, weight]) => ({ name, weight })),
        assignments: items.map(({ sortKey: _sortKey, ...a }) => a),
      },
    },
  };
}

const root = new URL("../evals/syllabi/", import.meta.url);
for (let i = 0; i < 20; i++) {
  const { id, syllabus, evalCase } = buildCase(i);
  const dir = new URL(`${id}/`, root);
  mkdirSync(dir, { recursive: true });
  writeFileSync(new URL("syllabus.txt", dir), syllabus);
  writeFileSync(new URL("case.json", dir), `${JSON.stringify(evalCase, null, 2)}\n`);
}
console.log("wrote 20 standard cases");
