"use client";

// Stats: focus time against grade per course, as paired bars with the numbers written
// out, a plain-language summary, and a CSV export. All numbers come from
// get_stats_overview; nothing is calculated here beyond wording and bar widths.
import type { StatsOverview } from "@studypulse/core/api";
import { useCallback, useEffect, useState } from "react";

import { useApi } from "@/components/auth/SessionProvider";
import { formatMinutes } from "@/components/today/model";
import {
  Button,
  CourseChip,
  EmptyState,
  Icon,
  MetricCard,
  MetricGrid,
  PageHeader,
} from "@/components/ui";

import {
  barWidth,
  belowTarget,
  courseLabel,
  hours,
  percent,
  PERIOD_OPTIONS,
  statsCsv,
  summarize,
} from "./model";
import styles from "./stats.module.css";

type Load =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; stats: StatsOverview };

export function StatsScreen() {
  const api = useApi();
  const [weeks, setWeeks] = useState<number>(4);
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    try {
      setLoad({ status: "ready", stats: await api.stats.overview(weeks) });
    } catch (e) {
      setLoad({
        status: "error",
        message: e instanceof Error ? e.message : "Something went wrong.",
      });
    }
  }, [api, weeks]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch for the chosen period
    void refresh();
  }, [refresh]);

  function exportCsv() {
    if (load.status !== "ready") return;
    const blob = new Blob([statsCsv(load.stats)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `studypulse-stats-${load.stats.today}.csv`;
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setMessage("Stats exported as a CSV file.");
  }

  const header = (
    <PageHeader
      title="Stats"
      description="How your focus time and grades line up."
      {...(load.status === "ready" && load.stats.courses.length > 0
        ? { primaryAction: { label: "Export", icon: "download" as const, onClick: exportCsv } }
        : {})}
    >
      <div className={styles.periods} role="group" aria-label="Period">
        {PERIOD_OPTIONS.map((w) => (
          <button
            key={w}
            type="button"
            className={styles.period}
            aria-pressed={weeks === w}
            onClick={() => setWeeks(w)}
          >
            {weeks === w ? <Icon name="check" size={18} /> : null}
            Last {w} weeks
          </button>
        ))}
      </div>
    </PageHeader>
  );

  if (load.status !== "ready") {
    return (
      <div className="sp-page">
        <div className={styles.content}>
          {header}
          {load.status === "loading" ? (
            <p role="status" className={styles.muted}>
              Loading your stats…
            </p>
          ) : (
            <p role="alert" className={styles.alert}>
              <Icon name="warning" size={20} />
              Couldn&apos;t load your stats: {load.message}
              <Button variant="text" onClick={() => void refresh()}>
                Try again
              </Button>
            </p>
          )}
        </div>
      </div>
    );
  }

  const { stats } = load;
  const weeklyAverage = Math.round(
    stats.weekly.reduce((s, w) => s + w.minutes, 0) / Math.max(1, stats.weekly.length),
  );
  const graded = stats.courses.filter((c) => c.current_grade !== null).length;
  const maxMinutes = Math.max(0, ...stats.courses.map((c) => c.focus_minutes));
  const summary = summarize(stats);

  return (
    <div className="sp-page">
      <div className={styles.content}>
        {header}

        <MetricGrid label="Summary">
          <MetricCard
            label="Weekly focus hours"
            value={hours(stats.this_week_minutes).replace(" h", "")}
            detail={`This week · average ${hours(weeklyAverage)} a week over ${stats.weeks} weeks`}
          />
          <MetricCard
            label="Average grade"
            value={stats.average_grade === null ? "No grades yet" : percent(stats.average_grade)}
            detail={
              graded === 0
                ? "Add scores to see it"
                : `Across ${graded} graded ${graded === 1 ? "course" : "courses"}`
            }
          />
        </MetricGrid>

        {stats.courses.length === 0 ? (
          <EmptyState
            icon="upload"
            title="No courses yet"
            action={{ label: "Upload a syllabus", href: "/courses/upload", icon: "upload" }}
          >
            Upload a syllabus, then focus and add scores to see how they line up.
          </EmptyState>
        ) : (
          <section className={styles.chartCard} aria-labelledby="chart-heading">
            <h2 id="chart-heading" className={styles.sectionHeading}>
              Focus time against grade
            </h2>
            <div className={styles.summary} id="chart-summary">
              {summary.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>

            <div className={styles.legend} aria-hidden="true">
              <span className={styles.legendItem}>
                <span className={`${styles.swatch} ${styles.focusBar}`} />
                Focus time
              </span>
              <span className={styles.legendItem}>
                <span className={`${styles.swatch} ${styles.gradeBar}`} />
                Current grade
              </span>
              <span className={styles.legendItem}>
                <span className={styles.targetSwatch} />
                Target
              </span>
            </div>

            {/* Each row states its numbers in text; the bars only draw them. */}
            <ul
              className={styles.chart}
              aria-label={`Focus time and grade by course, last ${stats.weeks} weeks`}
              aria-describedby="chart-summary"
            >
              {stats.courses.map((c) => {
                const below = belowTarget(c);
                return (
                  <li key={c.id} className={styles.row}>
                    <span className={styles.courseHead}>
                      <CourseChip code={courseLabel(c)} colorHex={c.color} title={c.name} />
                      <span className={styles.courseName}>{c.name}</span>
                    </span>

                    <span className={styles.barLabel}>Focus</span>
                    <span className={styles.track} aria-hidden="true">
                      <span
                        className={`${styles.bar} ${styles.focusBar}`}
                        style={{ width: `${barWidth(c.focus_minutes, maxMinutes)}%` }}
                      />
                    </span>
                    <span className={styles.value}>
                      {c.focus_minutes > 0 ? formatMinutes(c.focus_minutes) : "None"}
                    </span>

                    <span className={styles.barLabel}>Grade</span>
                    <span className={styles.track} aria-hidden="true">
                      {c.current_grade !== null ? (
                        <span
                          className={`${styles.bar} ${below ? styles.gradeBarBelow : styles.gradeBar}`}
                          style={{ width: `${barWidth(c.current_grade, 100)}%` }}
                        />
                      ) : null}
                      {c.target_grade !== null ? (
                        <span
                          className={styles.target}
                          style={{ left: `${Math.min(100, c.target_grade)}%` }}
                        />
                      ) : null}
                    </span>
                    <span className={below ? styles.valueError : styles.value}>
                      {c.current_grade === null ? (
                        "No grade yet"
                      ) : (
                        <>
                          {below ? <Icon name="warning" size={16} /> : null}
                          {percent(c.current_grade)}
                          {c.letter ? ` · ${c.letter}` : ""}
                          {below && c.target_grade !== null
                            ? `, below ${percent(c.target_grade)} target`
                            : ""}
                        </>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className={styles.note}>
              Focus time from {longDate(stats.period_start)} to today. Grades are current grades.
            </p>
          </section>
        )}

        <p role="status" aria-live="polite" className="sp-visually-hidden">
          {message}
        </p>
      </div>
    </div>
  );
}

/** "2027-03-01" -> "March 1" (a calendar date, so no timezone shift). */
function longDate(isoDate: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
  }).format(new Date(`${isoDate}T00:00:00Z`));
}
