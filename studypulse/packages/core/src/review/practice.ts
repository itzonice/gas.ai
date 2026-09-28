// Closed-note practice quizzes (prompt 73): one per course per week, and two per week in
// the 14 days before any exam in that course. Each is a short study block the student
// spends answering from memory, placed at their usual study time after any review
// sessions already booked that day. Pure: the planner persists the result.
import { addDays, dayOfWeek, daysBetween, localDate, zonedTimeToUtc } from "../time/index.ts";
import { REVIEW_GAP_MINUTES } from "./index.ts";

export interface PracticeCourse {
  courseId: string;
  termStart: string | null;
  termEnd: string | null;
}

export interface PracticeExam {
  courseId: string;
  dueAt: string;
}

export interface PracticeBlock {
  courseId: string;
  date: string;
  startsAt: string;
  endsAt: string;
  minutes: number;
}

export interface PracticePlanOptions {
  timezone: string;
  now: Date;
  /** Days ahead to plan, from today. */
  horizonDays: number;
  /** Local start time (HH:MM); quizzes go after anything in `busy` that day. */
  startTime?: string;
  minutes?: number;
  /** Already-booked time (e.g. exam reviews) that quizzes must not overlap. */
  busy?: readonly { startsAt: string; endsAt: string }[];
}

export const PRACTICE_QUIZ_MINUTES = 20;
/** Days before an exam when quizzes go twice weekly. */
export const EXAM_RAMP_DAYS = 14;
/** 0 = Sunday ... 6 = Saturday. Weekly quiz on Friday; the second one on Tuesday. */
export const WEEKLY_QUIZ_DAY = 5;
export const EXTRA_QUIZ_DAY = 2;

/** Local dates that get a quiz for one course, before placing them in time. */
export function practiceQuizDates(
  course: PracticeCourse,
  examDates: readonly string[],
  today: string,
  horizonDays: number,
): string[] {
  const dates: string[] = [];
  const exams = new Set(examDates);
  for (let i = 0; i <= horizonDays; i++) {
    const date = addDays(today, i);
    const dow = dayOfWeek(date);
    if (dow !== WEEKLY_QUIZ_DAY && dow !== EXTRA_QUIZ_DAY) continue;
    if (course.termStart && date < course.termStart) continue;
    if (course.termEnd && date > course.termEnd) continue;
    // The exam day itself is for the exam.
    if (exams.has(date)) continue;
    const rampingUp = examDates.some((exam) => {
      const daysBefore = daysBetween(date, exam);
      return daysBefore > 0 && daysBefore <= EXAM_RAMP_DAYS;
    });
    if (dow === WEEKLY_QUIZ_DAY || rampingUp) dates.push(date);
  }
  return dates;
}

export function buildPracticeQuizPlan(
  courses: readonly PracticeCourse[],
  exams: readonly PracticeExam[],
  options: PracticePlanOptions,
): PracticeBlock[] {
  const {
    timezone,
    now,
    horizonDays,
    startTime = "16:00",
    minutes = PRACTICE_QUIZ_MINUTES,
  } = options;
  const today = localDate(now, timezone);
  const busy = (options.busy ?? []).map((b) => ({
    start: Date.parse(b.startsAt),
    end: Date.parse(b.endsAt),
  }));

  const wanted = new Map<string, string[]>(); // date -> course ids
  for (const course of courses) {
    const examDates = exams
      .filter((e) => e.courseId === course.courseId && Date.parse(e.dueAt) > now.getTime())
      .map((e) => localDate(new Date(e.dueAt), timezone));
    for (const date of practiceQuizDates(course, examDates, today, horizonDays)) {
      wanted.set(date, [...(wanted.get(date) ?? []), course.courseId]);
    }
  }

  const blocks: PracticeBlock[] = [];
  for (const [date, courseIds] of [...wanted].sort(([a], [b]) => a.localeCompare(b))) {
    let cursor = zonedTimeToUtc(date, startTime, timezone).getTime();
    for (const courseId of courseIds) {
      // Skip past anything already booked, then stack quizzes with a short gap.
      for (let moved = true; moved;) {
        moved = false;
        for (const b of busy) {
          if (cursor < b.end && cursor + minutes * 60_000 > b.start) {
            cursor = b.end + REVIEW_GAP_MINUTES * 60_000;
            moved = true;
          }
        }
      }
      const start = cursor;
      const end = start + minutes * 60_000;
      cursor = end + REVIEW_GAP_MINUTES * 60_000;
      if (start < now.getTime()) continue;
      blocks.push({
        courseId,
        date,
        startsAt: new Date(start).toISOString(),
        endsAt: new Date(end).toISOString(),
        minutes,
      });
    }
  }
  return blocks;
}
