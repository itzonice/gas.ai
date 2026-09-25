"use client";

// Today: this week's metrics, today's review items first (exam reviews and closed-note
// practice quizzes), then the ranked task list, with the
// next exam and a focus shortcut in the right panel. Everything is computed server-side
// (get_today_overview and get_today_feed); this component only renders and calls the API.
import type { TodayFeedRow, TodayOverview } from "@studypulse/core/api";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useApi } from "@/components/auth/SessionProvider";
import {
  Button,
  CourseChip,
  EmptyState,
  Icon,
  MetricCard,
  MetricGrid,
  PageHeader,
  TaskList,
  TaskRow,
} from "@/components/ui";

import {
  atRiskStatus,
  dueText,
  examCountdown,
  focusHours,
  formatMinutes,
  reviewMeta,
  taskMeta,
  timeRange,
} from "./model";
import styles from "./today.module.css";

type Load =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; overview: TodayOverview; feed: TodayFeedRow[] };

export function TodayScreen() {
  const api = useApi();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  // Checkbox changes show immediately and roll back if the save fails.
  const [taskDone, setTaskDone] = useState<Record<string, boolean>>({});
  const [reviewDone, setReviewDone] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(() => new Date());

  const refresh = useCallback(async () => {
    try {
      const [overview, feed] = await Promise.all([api.today.overview(), api.today.feed()]);
      setLoad({ status: "ready", overview, feed });
      setTaskDone({});
      setReviewDone({});
      setNow(new Date());
    } catch (error) {
      setLoad({
        status: "error",
        message: error instanceof Error ? error.message : "Something went wrong.",
      });
    }
  }, [api]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
    void refresh();
  }, [refresh]);

  const courses = useMemo(
    () => new Map(load.status === "ready" ? load.overview.courses.map((c) => [c.id, c]) : []),
    [load],
  );

  async function toggleTask(row: TodayFeedRow, done: boolean) {
    setTaskDone((s) => ({ ...s, [row.item_id]: done }));
    try {
      await api.assignments.update({ id: row.item_id, status: done ? "done" : "todo" });
      setMessage(done ? `${row.title} marked done.` : `${row.title} marked not done.`);
    } catch {
      setTaskDone((s) => ({ ...s, [row.item_id]: !done }));
      setMessage(`Couldn't update ${row.title}. Try again.`);
    }
  }

  async function toggleReview(review: TodayFeedRow, done: boolean) {
    setReviewDone((s) => ({ ...s, [review.item_id]: done }));
    try {
      await api.plan.setBlockStatus({ id: review.item_id, status: done ? "done" : "planned" });
      setMessage(done ? `${review.title} done.` : `${review.title} reopened.`);
    } catch {
      setReviewDone((s) => ({ ...s, [review.item_id]: !done }));
      setMessage(`Couldn't update ${review.title}. Try again.`);
    }
  }

  async function rebuildPlan() {
    setMessage("Rebuilding your study plan…");
    try {
      await api.plan.rebuild();
      await refresh();
      setMessage("Study plan rebuilt.");
    } catch {
      setMessage("Couldn't rebuild your study plan. Try again.");
    }
  }

  const header = (
    <PageHeader
      title="Today"
      description={
        load.status === "ready" ? longDate(load.overview.today) : "What's due and what to do next."
      }
      primaryAction={{ label: "Start focus", icon: "focus", href: "/focus?start=1" }}
      secondaryActions={[
        { label: "Rebuild study plan", onSelect: () => void rebuildPlan() },
        { label: "Upload syllabus", href: "/courses/upload" },
      ]}
    />
  );

  if (load.status !== "ready") {
    return (
      <div className="sp-page">
        <div className={styles.content}>
          {header}
          {load.status === "loading" ? (
            <p role="status" className={styles.muted}>
              Loading your day…
            </p>
          ) : (
            <p role="alert" className={styles.alert}>
              <Icon name="warning" size={20} />
              Couldn&apos;t load today: {load.message}
              <Button variant="text" onClick={() => void refresh()}>
                Try again
              </Button>
            </p>
          )}
        </div>
      </div>
    );
  }

  const { overview, feed } = load;
  const reviews = feed.filter((r) => r.item_type === "review");
  const tasks = feed.filter((r) => r.item_type === "task");
  const tz = overview.timezone;
  const courseOf = (id: string) => {
    const c = courses.get(id);
    return { code: c?.code ?? "Course", colorHex: c?.color ?? null };
  };
  const nextExam = overview.next_exam;

  return (
    <div className="sp-page">
      <div className={styles.content}>
        {header}

        <MetricGrid label="This week">
          <MetricCard
            label="Due this week"
            value={overview.due_this_week}
            detail={overview.due_this_week === 1 ? "open task" : "open tasks"}
          />
          <MetricCard
            label="Focus hours this week"
            value={focusHours(overview.focus_minutes_this_week)}
            detail={`${formatMinutes(overview.focus_minutes_this_week)} since Monday`}
          />
          <MetricCard
            label="Courses at risk"
            value={overview.courses_at_risk.length}
            {...(overview.courses_at_risk.length
              ? { status: atRiskStatus(overview.courses_at_risk) }
              : { detail: "All courses on target" })}
          />
        </MetricGrid>

        {reviews.length > 0 ? (
          <section className={styles.section} aria-labelledby="reviews-heading">
            <h2 id="reviews-heading" className={styles.sectionHeading}>
              Reviews due today
            </h2>
            <TaskList label="Reviews due today">
              {reviews.map((review) => (
                <TaskRow
                  key={review.item_id}
                  id={review.item_id}
                  title={review.title}
                  href={`/focus?block=${review.item_id}`}
                  course={courseOf(review.course_id)}
                  {...(review.starts_at && review.ends_at
                    ? { dueText: timeRange(review.starts_at, review.ends_at, tz) }
                    : {})}
                  meta={reviewMeta(review)}
                  done={reviewDone[review.item_id] ?? review.block_status === "done"}
                  onToggleDone={(done) => void toggleReview(review, done)}
                />
              ))}
            </TaskList>
          </section>
        ) : null}

        <section className={styles.section} aria-labelledby="tasks-heading">
          <h2 id="tasks-heading" className={styles.sectionHeading}>
            Up next
          </h2>
          {tasks.length > 0 ? (
            <>
              <p className={styles.sectionNote}>
                Ranked by grade weight and due date, sized to your study time today.
              </p>
              <TaskList label="Up next, highest priority first">
                {tasks.map((row) => (
                  <TaskRow
                    key={row.item_id}
                    id={row.item_id}
                    title={row.title}
                    href={`/courses/${row.course_id}?assignment=${row.item_id}`}
                    course={courseOf(row.course_id)}
                    dueText={dueText(row.due_at, tz, now)}
                    overdue={row.overdue}
                    meta={taskMeta(row)}
                    done={taskDone[row.item_id] ?? row.status === "done"}
                    onToggleDone={(done) => void toggleTask(row, done)}
                    menuItems={[
                      {
                        label: "Focus on this",
                        href: `/focus?start=1&assignment=${row.item_id}`,
                      },
                      { label: "Open course", href: `/courses/${row.course_id}` },
                    ]}
                  />
                ))}
              </TaskList>
            </>
          ) : overview.courses.length === 0 ? (
            <EmptyState
              headingLevel={3}
              icon="upload"
              title="No courses yet"
              action={{ label: "Upload a syllabus", href: "/courses/upload", icon: "upload" }}
            >
              Upload a syllabus and StudyPulse builds your schedule.
            </EmptyState>
          ) : (
            <EmptyState headingLevel={3} title="You're caught up">
              Nothing needs your time today. New work shows up here as it gets close.
            </EmptyState>
          )}
        </section>

        <p role="status" aria-live="polite" className="sp-visually-hidden">
          {message}
        </p>
      </div>

      <aside className={styles.panel} aria-label="Coming up">
        <section className={styles.panelCard} aria-labelledby="exam-heading">
          <h2 id="exam-heading" className={styles.panelTitle}>
            Next exam
          </h2>
          {nextExam ? (
            <>
              <span className={styles.countdown}>{examCountdown(nextExam.days_until)}</span>
              <span>{nextExam.title}</span>
              <span className={styles.examMeta}>
                <CourseChip {...courseOf(nextExam.course_id)} />
                {dueText(nextExam.due_at, tz, now)}
              </span>
            </>
          ) : (
            <p className={styles.muted}>No exams coming up.</p>
          )}
        </section>
        <section className={styles.panelCard} aria-labelledby="timer-heading">
          <h2 id="timer-heading" className={styles.panelTitle}>
            Focus timer
          </h2>
          <p className={styles.muted}>
            {formatMinutes(overview.focus_minutes_this_week)} focused this week.
          </p>
          <Button variant="tonal" icon="focus" href="/focus">
            Open focus timer
          </Button>
        </section>
      </aside>
    </div>
  );
}

/** "2027-03-01" -> "Monday, March 1" (a calendar date, so no timezone shift). */
function longDate(isoDate: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date(`${isoDate}T00:00:00Z`));
}
