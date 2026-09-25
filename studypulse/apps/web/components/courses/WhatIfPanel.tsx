"use client";

// What-if calculator: type the score you expect on upcoming work and see the projected
// grade. Nothing is saved; the result is announced politely when it changes.
import {
  letterFor,
  whatIf,
  type GradeInput,
  type Hypothetical,
  type LetterScale,
} from "@studypulse/core/grades";
import { useMemo, useState } from "react";

import { Button, TextField } from "@/components/ui";

import type { CourseAssignment } from "./CourseDetailScreen";
import styles from "./courses.module.css";
import { formatPercent } from "./format";

export function WhatIfPanel({
  input,
  assignments,
  scale,
}: {
  input: GradeInput;
  assignments: readonly CourseAssignment[];
  scale: LetterScale | null | undefined;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const open = assignments.filter((a) => a.points_earned === null && a.status !== "skipped");

  const hypotheticals = useMemo(() => {
    const out: Record<string, Hypothetical> = {};
    for (const [id, raw] of Object.entries(values)) {
      const n = Number(raw);
      if (raw.trim() !== "" && Number.isFinite(n) && n >= 0 && n <= 200) out[id] = { percent: n };
    }
    return out;
  }, [values]);
  const result = whatIf(input, hypotheticals);
  const projected = result.projected.percent;
  const used = Object.keys(hypotheticals).length;

  return (
    <aside className={styles.panel} aria-labelledby="whatif-heading">
      <h2 id="whatif-heading" className={styles.panelTitle}>
        What if?
      </h2>
      <p className={styles.note}>Enter the score you expect on upcoming work.</p>
      <output
        className={styles.projected}
        aria-live="polite"
        htmlFor={open.map((a) => `whatif-${a.id}`).join(" ")}
      >
        <span className={styles.note}>{used ? "Projected grade" : "Current grade"}</span>
        <span className={styles.projectedValue}>
          {projected === null
            ? "No grades yet"
            : `${formatPercent(projected)} · ${letterFor(projected, scale ?? undefined)}`}
        </span>
        {used && result.change !== null ? (
          <span className={styles.note}>
            {result.change >= 0 ? "Up" : "Down"}{" "}
            {formatPercent(Math.abs(result.change)).replace("%", "")} points
          </span>
        ) : null}
      </output>
      {open.length ? (
        <ul className={styles.whatIfList} aria-label="Upcoming work">
          {open.slice(0, 12).map((a) => (
            <li key={a.id}>
              <TextField
                id={`whatif-${a.id}`}
                label={a.title}
                type="number"
                inputMode="decimal"
                min={0}
                max={200}
                step="any"
                placeholder="e.g. 85"
                hint="Score in %"
                value={values[a.id] ?? ""}
                onChange={(e) => {
                  const v = e.currentTarget.value;
                  setValues((s) => ({ ...s, [a.id]: v }));
                }}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.note}>Everything is graded.</p>
      )}
      {used ? (
        <Button
          variant="text"
          onClick={() => {
            setValues({});
          }}
        >
          Clear what-ifs
        </Button>
      ) : null}
    </aside>
  );
}
