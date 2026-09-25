"use client";

// Course detail: current grade, target, and the score needed on the final; category
// weights; every assignment (a table from 600 px, a list on phones); and a what-if
// calculator in the right panel. Grade math comes from @studypulse/core/grades.
import type { ApiClient } from "@studypulse/core/api";
import {
  currentGrade,
  findFinalExam,
  gradeInputFromRows,
  letterFor,
  letterScaleSchema,
  scoreNeededOn,
  type GradeInput,
} from "@studypulse/core/grades";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useApi } from "@/components/auth/SessionProvider";
import { KIND_LABELS } from "@/components/syllabus/labels";
import { dueText } from "@/components/today/model";
import { Button, EmptyState, Icon, MetricCard, MetricGrid, PageHeader } from "@/components/ui";

import { AddScoreDialog } from "./AddScoreDialog";
import styles from "./courses.module.css";
import { formatPercent, formatScore, targetStatus } from "./format";
import { TargetDialog } from "./TargetDialog";
import { WhatIfPanel } from "./WhatIfPanel";

export type CourseDetail = Awaited<ReturnType<ApiClient["courses"]["get"]>>;
export type CourseAssignment = CourseDetail["assignments"][number];

type Load =
  | { status: "loading" }
  | { status: "error"; message: string; notFound: boolean }
  | { status: "ready"; detail: CourseDetail };

export function CourseDetailScreen({ courseId }: { courseId: string }) {
  const api = useApi();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [dialog, setDialog] = useState<"score" | "target" | null>(null);
  const [message, setMessage] = useState("");
  const [now] = useState(() => new Date());

  const refresh = useCallback(async () => {
    try {
      setLoad({ status: "ready", detail: await api.courses.get(courseId) });
    } catch (e) {
      setLoad({
        status: "error",
        message: e instanceof Error ? e.message : "Something went wrong.",
        notFound: e instanceof Error && "status" in e && e.status === 404,
      });
    }
  }, [api, courseId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
    void refresh();
  }, [refresh]);

  const detail = load.status === "ready" ? load.detail : null;
  const input: GradeInput | null = useMemo(
    () =>
      detail
        ? gradeInputFromRows(
            detail.categories,
            detail.assignments.map((a) => ({ ...a })),
          )
        : null,
    [detail],
  );

  if (!detail || !input) {
    return (
      <div className="sp-page">
        <div className={styles.content}>
          <PageHeader title="Course" />
          {load.status === "error" ? (
            load.notFound ? (
              <EmptyState
                icon="warning"
                title="Course not found"
                action={{ label: "Back to courses", href: "/courses" }}
              >
                It may have been deleted, or it belongs to another account.
              </EmptyState>
            ) : (
              <p role="alert" className={styles.alert}>
                <Icon name="warning" size={20} />
                Couldn&apos;t load this course: {load.message}
                <Button variant="text" onClick={() => void refresh()}>
                  Try again
                </Button>
              </p>
            )
          ) : (
            <p role="status" className={styles.note}>
              Loading…
            </p>
          )}
        </div>
      </div>
    );
  }

  const { course, categories, assignments, timezone } = detail;
  const scale = letterScaleSchema.safeParse(course.letter_scale);
  const grade = currentGrade(input);
  const target = course.target_grade === null ? null : Number(course.target_grade);
  const final = findFinalExam(
    assignments.map((a) => ({
      ...a,
      points_earned: a.points_earned === null ? null : Number(a.points_earned),
    })),
  );
  const needed = target !== null && final ? scoreNeededOn(input, final.id, target) : null;
  const status = targetStatus(grade.percent, target);
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  const byCategory = new Map(grade.categories.map((c) => [c.categoryId, c]));
  const totalWeight = categories.reduce((s, c) => s + Number(c.weight), 0);
  const title = course.code ? `${course.code} ${course.name}` : course.name;

  const statusText = (a: CourseAssignment) => {
    if (a.status === "done" || a.points_earned !== null) return "Done";
    if (a.status === "skipped") return "Skipped";
    if (a.due_at && Date.parse(a.due_at) < now.getTime()) return "Overdue";
    return "To do";
  };
  const statusCell = (a: CourseAssignment) => {
    const text = statusText(a);
    return text === "Overdue" ? (
      <span className={styles.statusError}>
        <Icon name="warning" size={16} />
        Overdue
      </span>
    ) : (
      text
    );
  };

  return (
    <div className="sp-page">
      <div className={styles.content}>
        <PageHeader
          title={title}
          description={course.instructor ?? undefined}
          primaryAction={{
            label: "Add score",
            icon: "add",
            onClick: () => {
              setDialog("score");
            },
          }}
          secondaryActions={[
            {
              label: target === null ? "Set a target grade" : "Change target grade",
              onSelect: () => {
                setDialog("target");
              },
            },
            { label: "Upload another syllabus", href: "/courses/upload" },
          ]}
        />

        <MetricGrid label="Grade">
          <MetricCard
            label="Current grade"
            value={
              grade.percent === null
                ? "—"
                : `${formatPercent(grade.percent)} · ${letterFor(grade.percent, scale.success && scale.data ? scale.data : undefined)}`
            }
            {...(status?.tone === "error"
              ? { status: { tone: "error" as const, text: status.text } }
              : {
                  detail:
                    status?.text ?? (grade.percent === null ? "No grades yet" : "No target set"),
                })}
          />
          <MetricCard
            label="Target"
            value={target === null ? "Not set" : formatPercent(target)}
            detail={target === null ? "Set one to see what you need" : "Your goal for this course"}
          />
          <MetricCard
            label="Needed on the final"
            value={
              !final
                ? "—"
                : !needed
                  ? "—"
                  : needed.status === "secured"
                    ? "Secured"
                    : needed.status === "impossible"
                      ? "Out of reach"
                      : formatPercent(needed.percent)
            }
            detail={
              !final
                ? "No final exam in this course"
                : !needed
                  ? "Set a target to see this"
                  : needed.status === "secured"
                    ? `You reach your target even with 0 on ${final.title}`
                    : needed.status === "impossible"
                      ? `It would take over 100% on ${final.title}`
                      : `On ${final.title}, with other work as it stands`
            }
          />
        </MetricGrid>

        <section className={styles.section} aria-labelledby="weights-heading">
          <h2 id="weights-heading" className={styles.sectionHeading}>
            Grade categories
          </h2>
          {categories.length ? (
            <>
              <ul className={styles.weights} aria-label="Grade categories">
                {categories.map((c) => {
                  const g = byCategory.get(c.id);
                  const weight = Number(c.weight);
                  return (
                    <li key={c.id} className={styles.weightRow}>
                      <span>
                        <strong>{c.name}</strong>
                        {c.drop_lowest ? ` · lowest ${String(c.drop_lowest)} dropped` : ""}
                      </span>
                      <span>
                        {weight}% of grade · you: {formatPercent(g?.percent)}
                      </span>
                      <span className={styles.weightBar} aria-hidden="true">
                        <span
                          className={styles.weightFill}
                          style={{
                            display: "block",
                            width: `${String(totalWeight ? (weight / totalWeight) * 100 : 0)}%`,
                          }}
                        />
                      </span>
                    </li>
                  );
                })}
              </ul>
              {Math.round(totalWeight) !== 100 ? (
                <p className={styles.note}>
                  Weights add up to {Math.round(totalWeight * 100) / 100}%; grades are scaled to the
                  categories you have.
                </p>
              ) : null}
            </>
          ) : (
            <p className={styles.note}>No grade categories. Everything counts equally by points.</p>
          )}
        </section>

        <section className={styles.section} aria-labelledby="assignments-heading">
          <h2 id="assignments-heading" className={styles.sectionHeading}>
            Assignments
          </h2>
          {assignments.length === 0 ? (
            <p className={styles.note}>No assignments yet.</p>
          ) : (
            <>
              <table className={styles.table}>
                <caption className="sp-visually-hidden">
                  Assignments in {title}, soonest due first
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Assignment</th>
                    <th scope="col">Category</th>
                    <th scope="col">Due</th>
                    <th scope="col" className={styles.num}>
                      Score
                    </th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {assignments.map((a) => (
                    <tr key={a.id} id={`assignment-${a.id}`}>
                      <th scope="row" style={{ fontWeight: 500, color: "inherit" }}>
                        {a.title}
                        <div className={styles.meta}>{KIND_LABELS[a.kind]}</div>
                      </th>
                      <td>{a.category_id ? (categoryName.get(a.category_id) ?? "—") : "—"}</td>
                      <td>{dueText(a.due_at, timezone, now).replace(/^Due /, "")}</td>
                      <td className={styles.num}>
                        {formatScore(a.points_earned, a.points_possible)}
                      </td>
                      <td>{statusCell(a)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <ul className={styles.list} aria-label={`Assignments in ${title}`}>
                {assignments.map((a) => (
                  <li key={a.id} className={styles.listItem}>
                    <span className={styles.itemTitle}>{a.title}</span>
                    <span className={styles.meta}>
                      {dueText(a.due_at, timezone, now)} ·{" "}
                      {a.category_id
                        ? (categoryName.get(a.category_id) ?? "No category")
                        : "No category"}
                    </span>
                    <span className={styles.meta}>
                      Score: {formatScore(a.points_earned, a.points_possible)} · {statusCell(a)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <p role="status" className="sp-visually-hidden">
          {message}
        </p>
      </div>

      <WhatIfPanel
        input={input}
        assignments={assignments}
        scale={scale.success ? scale.data : null}
      />

      <AddScoreDialog
        open={dialog === "score"}
        assignments={assignments}
        onClose={() => {
          setDialog(null);
        }}
        onSaved={(text) => {
          setDialog(null);
          setMessage(text);
          void refresh();
        }}
      />
      <TargetDialog
        open={dialog === "target"}
        courseId={course.id}
        current={target}
        onClose={() => {
          setDialog(null);
        }}
        onSaved={(text) => {
          setDialog(null);
          setMessage(text);
          void refresh();
        }}
      />
    </div>
  );
}
