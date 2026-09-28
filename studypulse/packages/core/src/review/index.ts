// Exam review plan: spaced review sessions 7, 3, and 1 days before each exam, at the
// student's usual study time. Sessions already in the past are skipped; the exam day
// itself never gets one (that's for the exam).
import { addDays, localDate, zonedTimeToUtc } from "../time/index.ts";

export interface ReviewExam {
  assignmentId: string;
  courseId: string;
  dueAt: string;
}

export interface ReviewSessionSpec {
  daysBefore: number;
  minutes: number;
}

export const DEFAULT_REVIEW_SESSIONS: readonly ReviewSessionSpec[] = [
  { daysBefore: 7, minutes: 45 },
  { daysBefore: 3, minutes: 60 },
  { daysBefore: 1, minutes: 90 },
];

export interface ReviewBlock {
  assignmentId: string;
  courseId: string;
  daysBefore: number;
  startsAt: string;
  endsAt: string;
  minutes: number;
}

export interface ReviewPlanOptions {
  timezone: string;
  now: Date;
  /** Local start time of review sessions (HH:MM). */
  startTime?: string;
  sessions?: readonly ReviewSessionSpec[];
}

/** Minutes between back-to-back review sessions on the same day. */
export const REVIEW_GAP_MINUTES = 10;

export function buildReviewPlan(
  exams: readonly ReviewExam[],
  options: ReviewPlanOptions,
): ReviewBlock[] {
  const { timezone, now, startTime = "16:00", sessions = DEFAULT_REVIEW_SESSIONS } = options;

  // Wanted sessions per local day, soonest exam first.
  const byDay = new Map<string, { exam: ReviewExam; spec: ReviewSessionSpec }[]>();
  for (const exam of [...exams].sort((a, b) => a.dueAt.localeCompare(b.dueAt))) {
    if (new Date(exam.dueAt) <= now) continue;
    const examDate = localDate(new Date(exam.dueAt), timezone);
    for (const spec of sessions) {
      const date = addDays(examDate, -spec.daysBefore);
      const list = byDay.get(date) ?? [];
      list.push({ exam, spec });
      byDay.set(date, list);
    }
  }

  // Two exams can want the same day: stack their sessions instead of overlapping.
  const blocks: ReviewBlock[] = [];
  for (const [date, wanted] of byDay) {
    let cursor = zonedTimeToUtc(date, startTime, timezone);
    for (const { exam, spec } of wanted) {
      const start = cursor;
      const end = new Date(start.getTime() + spec.minutes * 60_000);
      if (start < now || end > new Date(exam.dueAt)) continue;
      blocks.push({
        assignmentId: exam.assignmentId,
        courseId: exam.courseId,
        daysBefore: spec.daysBefore,
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        minutes: spec.minutes,
      });
      cursor = new Date(end.getTime() + REVIEW_GAP_MINUTES * 60_000);
    }
  }
  return blocks.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}
export * from "./practice.ts";
