// Rebuilds a user's study plan: loads their open work and availability, runs the core
// scheduler, and atomically swaps their future scheduler blocks for the new plan.
// Works with a user client (RLS) or the admin client (cron); every query filters by
// user explicitly, so it's correct either way.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@studypulse/db";
import type { Logger } from "@studypulse/core/observability/index.ts";
import {
  DEFAULT_DAILY_MINUTES,
  minutesRemaining,
  priority,
  type TaskKind,
} from "@studypulse/core/priority/index.ts";
import {
  buildPracticeQuizPlan,
  buildReviewPlan,
  EXAM_RAMP_DAYS,
} from "@studypulse/core/review/index.ts";
import { scheduleStudyBlocks, type ScheduleResult } from "@studypulse/core/scheduler/index.ts";
import { addDays, dayOfWeek, localDate, zonedTimeToUtc } from "@studypulse/core/time/index.ts";

type Db = SupabaseClient<Database>;

export const PLAN_HORIZON_DAYS = 28;

export interface ReplanSummary extends ScheduleResult {
  timezone: string;
  inserted: number;
  reviewBlocks: number;
  practiceBlocks: number;
}

export async function replanUser(
  db: Db,
  userId: string,
  now: Date,
  log: Logger,
): Promise<ReplanSummary> {
  const { data: profile, error: profileError } = await db
    .from("profiles")
    .select("timezone, daily_study_minutes, study_minutes_by_weekday, study_start_time")
    .eq("id", userId)
    .single();
  if (profileError) throw profileError;

  const tz = profile.timezone;
  const today = localDate(now, tz);
  const horizonEnd = zonedTimeToUtc(addDays(today, PLAN_HORIZON_DAYS + 1), "00:00", tz);
  const todayStart = zonedTimeToUtc(today, "00:00", tz);

  // 1. Exam review sessions (7/3/1 days before), persisted first so the scheduler
  //    works around them and counts them toward each exam's study time.
  const { data: exams, error: examsError } = await db
    .from("assignments")
    .select("id, course_id, due_at, courses!inner(user_id, archived_at)")
    .eq("courses.user_id", userId)
    .is("courses.archived_at", null)
    .eq("kind", "exam")
    .in("status", ["todo", "in_progress"])
    .gt("due_at", now.toISOString())
    .lt("due_at", horizonEnd.toISOString());
  if (examsError) throw examsError;
  const reviews = buildReviewPlan(
    (exams ?? []).flatMap((e) =>
      e.due_at ? [{ assignmentId: e.id, courseId: e.course_id, dueAt: e.due_at }] : [],
    ),
    { timezone: tz, now, startTime: profile.study_start_time.slice(0, 5) },
  );
  const { data: reviewBlocks, error: reviewError } = await db.rpc("replace_review_plan", {
    p_user_id: userId,
    p_from: now.toISOString(),
    p_assignment_ids: (exams ?? []).map((e) => e.id),
    p_blocks: reviews.map((r) => ({
      assignment_id: r.assignmentId,
      course_id: r.courseId,
      starts_at: r.startsAt,
      ends_at: r.endsAt,
    })),
  });
  if (reviewError) throw reviewError;

  // 1b. Closed-note practice quizzes: weekly per course, twice weekly in the two weeks
  //     before an exam, placed after the day's reviews. Exams up to two weeks past the
  //     horizon still ramp up quizzes inside it.
  const rampEnd = zonedTimeToUtc(
    addDays(today, PLAN_HORIZON_DAYS + 1 + EXAM_RAMP_DAYS),
    "00:00",
    tz,
  );
  const [coursesRes, upcomingExamsRes] = await Promise.all([
    db
      .from("courses")
      .select("id, term_start, term_end")
      .eq("user_id", userId)
      .is("archived_at", null),
    db
      .from("assignments")
      .select("course_id, due_at, courses!inner(user_id, archived_at)")
      .eq("courses.user_id", userId)
      .is("courses.archived_at", null)
      .eq("kind", "exam")
      .in("status", ["todo", "in_progress"])
      .gt("due_at", now.toISOString())
      .lt("due_at", rampEnd.toISOString()),
  ]);
  if (coursesRes.error) throw coursesRes.error;
  if (upcomingExamsRes.error) throw upcomingExamsRes.error;
  const practice = buildPracticeQuizPlan(
    (coursesRes.data ?? []).map((c) => ({
      courseId: c.id,
      termStart: c.term_start,
      termEnd: c.term_end,
    })),
    (upcomingExamsRes.data ?? []).flatMap((e) =>
      e.due_at ? [{ courseId: e.course_id, dueAt: e.due_at }] : [],
    ),
    {
      timezone: tz,
      now,
      horizonDays: PLAN_HORIZON_DAYS,
      startTime: profile.study_start_time.slice(0, 5),
      busy: reviews.map((r) => ({ startsAt: r.startsAt, endsAt: r.endsAt })),
    },
  );
  const { data: practiceBlocks, error: practiceError } = await db.rpc("replace_practice_plan", {
    p_user_id: userId,
    p_from: now.toISOString(),
    p_blocks: practice.map((p) => ({
      course_id: p.courseId,
      starts_at: p.startsAt,
      ends_at: p.endsAt,
    })),
  });
  if (practiceError) throw practiceError;

  // 2. Everything the scheduler needs.
  const [assignmentsRes, sessionsRes, blocksRes] = await Promise.all([
    db
      .from("assignments")
      .select(
        "id, course_id, kind, status, due_at, estimated_minutes, courses!inner(user_id, archived_at)",
      )
      .eq("courses.user_id", userId)
      .is("courses.archived_at", null)
      .in("status", ["todo", "in_progress"])
      .gt("due_at", now.toISOString())
      .lt("due_at", horizonEnd.toISOString()),
    db
      .from("study_sessions")
      .select("assignment_id, duration_minutes")
      .eq("user_id", userId)
      .not("assignment_id", "is", null),
    db
      .from("study_blocks")
      .select("assignment_id, starts_at, ends_at, status, locked, source")
      .eq("user_id", userId)
      .gte("starts_at", todayStart.toISOString())
      .lt("starts_at", horizonEnd.toISOString()),
  ]);
  for (const res of [assignmentsRes, sessionsRes, blocksRes]) if (res.error) throw res.error;

  // Filtered to this user's assignments: with the admin client the view is unrestricted.
  const assignmentIds = (assignmentsRes.data ?? []).map((a) => a.id);
  const sharesRes = assignmentIds.length
    ? await db
        .from("assignment_grade_shares")
        .select("assignment_id, grade_share")
        .in("assignment_id", assignmentIds)
    : { data: [], error: null };
  if (sharesRes.error) throw sharesRes.error;

  const shares = new Map(
    (sharesRes.data ?? []).map((s) => [s.assignment_id, Number(s.grade_share ?? 0)]),
  );
  const logged = new Map<string, number>();
  for (const s of sessionsRes.data ?? []) {
    if (s.assignment_id)
      logged.set(s.assignment_id, (logged.get(s.assignment_id) ?? 0) + (s.duration_minutes ?? 0));
  }
  const daily = profile.daily_study_minutes ?? DEFAULT_DAILY_MINUTES;

  const tasks = (assignmentsRes.data ?? []).flatMap((a) => {
    if (!a.due_at) return [];
    const kind = a.kind as TaskKind;
    const remaining = minutesRemaining(a.estimated_minutes, kind, logged.get(a.id) ?? 0);
    return [
      {
        assignmentId: a.id,
        courseId: a.course_id,
        kind,
        dueAt: a.due_at,
        minutesRemaining: remaining,
        priority: priority({
          gradeShare: shares.get(a.id) ?? 0,
          dueAt: a.due_at,
          now,
          minutesRemaining: remaining,
          status: a.status,
          dailyMinutes: daily,
        }).score,
      },
    ];
  });

  // Blocks the scheduler must work around: anything it didn't create or can't move.
  const existing = (blocksRes.data ?? [])
    .filter(
      (b) =>
        b.locked ||
        b.source !== "scheduler" ||
        b.status !== "planned" ||
        Date.parse(b.starts_at) < now.getTime(),
    )
    .map((b) => ({
      startsAt: b.starts_at,
      endsAt: b.ends_at,
      assignmentId: b.status === "missed" ? null : b.assignment_id,
    }));

  const byWeekday = profile.study_minutes_by_weekday;
  const result = scheduleStudyBlocks(tasks, {
    timezone: tz,
    now,
    horizonDays: PLAN_HORIZON_DAYS,
    dayStartTime: profile.study_start_time.slice(0, 5),
    capacity: (date) => byWeekday?.[dayOfWeek(date)] ?? daily,
    existing,
  });

  const { data: inserted, error: replaceError } = await db.rpc("replace_study_plan", {
    p_user_id: userId,
    p_from: now.toISOString(),
    p_blocks: result.blocks.map((b) => ({
      assignment_id: b.assignmentId,
      course_id: b.courseId,
      starts_at: b.startsAt,
      ends_at: b.endsAt,
      kind: b.kind,
    })),
  });
  if (replaceError) throw replaceError;

  log.info("study plan rebuilt", {
    user_id: userId,
    tasks: tasks.length,
    blocks: result.blocks.length,
    unscheduled: result.unscheduled.length,
    overloaded_days: result.overloadedDays.length,
  });
  return {
    ...result,
    timezone: tz,
    inserted: inserted ?? 0,
    reviewBlocks: reviewBlocks ?? 0,
    practiceBlocks: practiceBlocks ?? 0,
  };
}
