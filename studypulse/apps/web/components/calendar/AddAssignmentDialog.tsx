"use client";

// "Add assignment" from the calendar: course, title, type, and due date and time (in the
// student's timezone). The server validates again and replans around it.
import { ApiError, type CalendarRange } from "@studypulse/core/api";
import { ASSIGNMENT_KINDS } from "@studypulse/core/syllabus";
import { zonedTimeToUtc, type IsoDate } from "@studypulse/core/time";
import { useEffect, useState, type FormEvent } from "react";

import { useApi } from "@/components/auth/SessionProvider";
import { KIND_LABELS } from "@/components/syllabus/labels";
import { Button, Dialog, EmptyState, SelectField, TextField } from "@/components/ui";

import styles from "./calendar.module.css";

type Errors = Partial<Record<"courseId" | "title" | "dueAt" | "form", string>>;

export function AddAssignmentDialog({
  open,
  date,
  timezone,
  courses,
  onClose,
  onAdded,
}: {
  open: boolean;
  date: IsoDate;
  timezone: string;
  courses: CalendarRange["courses"];
  onClose: () => void;
  onAdded: (title: string) => void;
}) {
  const api = useApi();
  const [courseId, setCourseId] = useState("");
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<(typeof ASSIGNMENT_KINDS)[number]>("assignment");
  const [dueDate, setDueDate] = useState(date);
  const [dueTime, setDueTime] = useState("23:59");
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  // Each time it opens: the selected day, and the first course if there's only one.
  useEffect(() => {
    if (!open) return;
    /* eslint-disable react-hooks/set-state-in-effect -- resetting the form on open */
    setDueDate(date);
    setTitle("");
    setErrors({});
    setCourseId((c) => c || (courses.length === 1 ? (courses[0]?.id ?? "") : ""));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, date, courses]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: Errors = {};
    if (!courseId) next.courseId = "Choose a course.";
    if (!title.trim()) next.title = "Give it a title.";
    if (!dueDate) next.dueAt = "Pick a due date.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      await api.assignments.create({
        courseId,
        title: title.trim(),
        kind,
        dueAt: zonedTimeToUtc(dueDate, dueTime || "23:59", timezone).toISOString(),
      });
      onAdded(title.trim());
    } catch (e) {
      if (e instanceof ApiError && e.issues.length) {
        const byField: Errors = {};
        for (const issue of e.issues) {
          const key = (["courseId", "title", "dueAt"] as const).find((k) => k === issue.path);
          byField[key ?? "form"] ??= issue.message;
        }
        setErrors(byField);
      } else {
        setErrors({ form: e instanceof Error ? e.message : "Couldn't add it. Try again." });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      labelledBy="add-assignment-title"
      title="Add assignment"
      footer={
        courses.length ? (
          <>
            <Button variant="text" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="filled" type="submit" form="add-assignment-form" disabled={busy}>
              {busy ? "Adding…" : "Add"}
            </Button>
          </>
        ) : null
      }
    >
      {courses.length === 0 ? (
        <EmptyState
          headingLevel={3}
          icon="upload"
          title="Add a course first"
          action={{ label: "Upload a syllabus", href: "/courses/upload", icon: "upload" }}
        >
          Assignments belong to a course. Upload a syllabus to create one.
        </EmptyState>
      ) : (
        <form
          id="add-assignment-form"
          onSubmit={(e) => void onSubmit(e)}
          noValidate
          style={{ display: "grid", gap: "var(--sp-space-card)" }}
        >
          {errors.form ? (
            <p role="alert" className={styles.alert}>
              {errors.form}
            </p>
          ) : null}
          <SelectField
            label="Course"
            value={courseId}
            required
            error={errors.courseId ?? null}
            onChange={(e) => {
              setCourseId(e.currentTarget.value);
            }}
          >
            <option value="">Choose a course</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code === c.name ? c.name : `${c.code} · ${c.name}`}
              </option>
            ))}
          </SelectField>
          <TextField
            label="Title"
            value={title}
            required
            placeholder="e.g. Problem Set 6"
            error={errors.title ?? null}
            onChange={(e) => {
              setTitle(e.currentTarget.value);
            }}
          />
          <SelectField
            label="Type"
            value={kind}
            onChange={(e) => {
              setKind(e.currentTarget.value as (typeof ASSIGNMENT_KINDS)[number]);
            }}
          >
            {ASSIGNMENT_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </SelectField>
          <div className={styles.twoUp}>
            <TextField
              label="Due date"
              type="date"
              value={dueDate}
              required
              error={errors.dueAt ?? null}
              onChange={(e) => {
                setDueDate(e.currentTarget.value);
              }}
            />
            <TextField
              label="Due time"
              type="time"
              value={dueTime}
              hint="11:59 PM if you're not sure."
              onChange={(e) => {
                setDueTime(e.currentTarget.value);
              }}
            />
          </div>
        </form>
      )}
    </Dialog>
  );
}
