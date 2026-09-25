"use client";

// Courses: one card per course with its code, current grade (and whether it's on track
// for the target, in words), and the next thing due.
import type { CoursesOverview } from "@studypulse/core/api";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { useApi } from "@/components/auth/SessionProvider";
import { dueText } from "@/components/today/model";
import { Button, courseVars, EmptyState, Icon, PageHeader } from "@/components/ui";

import styles from "./courses.module.css";
import { formatPercent, targetStatus } from "./format";

type Load =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; overview: CoursesOverview };

export function CoursesScreen() {
  const api = useApi();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [now] = useState(() => new Date());

  const refresh = useCallback(async () => {
    try {
      setLoad({ status: "ready", overview: await api.courses.overview() });
    } catch (e) {
      setLoad({
        status: "error",
        message: e instanceof Error ? e.message : "Something went wrong.",
      });
    }
  }, [api]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
    void refresh();
  }, [refresh]);

  return (
    <div className="sp-page">
      <div className={styles.content}>
        <PageHeader
          title="Courses"
          description="Your courses, grades, and what's due next."
          primaryAction={{ label: "Upload syllabus", icon: "upload", href: "/courses/upload" }}
        />
        {load.status === "loading" ? (
          <p role="status" className={styles.note}>
            Loading your courses…
          </p>
        ) : load.status === "error" ? (
          <p role="alert" className={styles.alert}>
            <Icon name="warning" size={20} />
            Couldn&apos;t load your courses: {load.message}
            <Button variant="text" onClick={() => void refresh()}>
              Try again
            </Button>
          </p>
        ) : load.overview.courses.length === 0 ? (
          <EmptyState
            icon="upload"
            title="No courses yet"
            action={{ label: "Upload a syllabus", href: "/courses/upload", icon: "upload" }}
          >
            Upload a syllabus and StudyPulse builds the course, its grading, and your schedule.
          </EmptyState>
        ) : (
          <ul className={styles.cards} aria-label="Courses">
            {load.overview.courses.map((c) => {
              const status = targetStatus(c.current_grade, c.target_grade);
              return (
                <li key={c.id}>
                  <Link
                    href={`/courses/${c.id}`}
                    className={styles.card}
                    style={{ ["--stripe" as string]: courseVars(c.color).stripe }}
                  >
                    <span className={styles.cardTitle}>{c.code ?? c.name}</span>
                    {c.code ? <span className={styles.cardName}>{c.name}</span> : null}
                    <span className={styles.grade}>
                      {formatPercent(c.current_grade)}
                      {c.letter && c.current_grade !== null ? ` · ${c.letter}` : ""}
                    </span>
                    {status ? (
                      <span
                        className={status.tone === "error" ? styles.statusError : styles.statusOk}
                      >
                        {status.tone === "error" ? <Icon name="warning" size={18} /> : null}
                        {status.text}
                      </span>
                    ) : null}
                    <span className={styles.meta}>
                      {c.next_due
                        ? `Next: ${c.next_due.title}, ${dueText(c.next_due.due_at, load.overview.timezone, now).replace(/^Due /, "due ")}`
                        : "Nothing due soon"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
