"use client";

// "New card set" and "New note": both start from a course. Without a course there is
// nothing to attach them to, so the dialog offers to add one.
import { ApiError, type StudyCourse } from "@studypulse/core/api";
import { useEffect, useState, type FormEvent } from "react";

import { useApi } from "@/components/auth/SessionProvider";
import { Button, Dialog, Icon, SelectField, TextArea, TextField } from "@/components/ui";

import styles from "./study.module.css";

const courseLabel = (c: StudyCourse) => (c.code ? `${c.code} ${c.name}` : c.name);

function CourseSelect({
  courses,
  value,
  onChange,
}: {
  courses: readonly StudyCourse[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <SelectField
      label="Course"
      value={value}
      onChange={(e) => {
        onChange(e.currentTarget.value);
      }}
    >
      {courses.map((c) => (
        <option key={c.id} value={c.id}>
          {courseLabel(c)}
        </option>
      ))}
    </SelectField>
  );
}

function errorText(e: unknown, fallback: string): string {
  if (e instanceof ApiError && e.issues.length) return e.issues.map((i) => i.message).join(" ");
  return e instanceof Error ? e.message : fallback;
}

export function NewSetDialog({
  open,
  courses,
  defaultCourseId,
  onClose,
  onCreated,
}: {
  open: boolean;
  courses: readonly StudyCourse[];
  defaultCourseId?: string | undefined;
  onClose: () => void;
  onCreated: (set: { id: string }) => void;
}) {
  const api = useApi();
  const [courseId, setCourseId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    /* eslint-disable react-hooks/set-state-in-effect -- resetting the form on open */
    setCourseId(defaultCourseId ?? courses[0]?.id ?? "");
    setTitle("");
    setDescription("");
    setError(null);
    setTitleError(null);
    setBusy(false);
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when it opens
  }, [open]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) {
      setTitleError("Name the set.");
      return;
    }
    setTitleError(null);
    setError(null);
    setBusy(true);
    try {
      onCreated(
        await api.sets.create({
          courseId,
          title,
          ...(description.trim() ? { description } : {}),
        }),
      );
    } catch (e) {
      setError(errorText(e, "Couldn't create the set."));
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New card set"
      labelledBy="new-set-title"
      footer={
        <>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="filled" disabled={busy || !courseId} type="submit" form="new-set-form">
            {busy ? "Creating…" : "Create set"}
          </Button>
        </>
      }
    >
      <form
        id="new-set-form"
        className={styles.formGrid}
        onSubmit={(e) => void onSubmit(e)}
        noValidate
      >
        <TextField
          label="Set name"
          hint="For example, Chapter 5 vocabulary."
          value={title}
          onChange={(e) => {
            setTitle(e.currentTarget.value);
          }}
          error={titleError}
          maxLength={120}
          autoComplete="off"
          required
        />
        <CourseSelect courses={courses} value={courseId} onChange={setCourseId} />
        <TextArea
          label="Description (optional)"
          value={description}
          onChange={(e) => {
            setDescription(e.currentTarget.value);
          }}
          maxLength={500}
          rows={3}
        />
        {error ? (
          <p role="alert" className={styles.formError}>
            <Icon name="warning" size={18} />
            {error}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}

export function NewNoteDialog({
  open,
  courses,
  defaultCourseId,
  onClose,
  onCreated,
}: {
  open: boolean;
  courses: readonly StudyCourse[];
  defaultCourseId?: string | undefined;
  onClose: () => void;
  onCreated: (note: { id: string }) => void;
}) {
  const api = useApi();
  const [courseId, setCourseId] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    /* eslint-disable react-hooks/set-state-in-effect -- resetting the form on open */
    setCourseId(defaultCourseId ?? courses[0]?.id ?? "");
    setTitle("");
    setError(null);
    setBusy(false);
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when it opens
  }, [open]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      onCreated(await api.notes.create({ courseId, ...(title.trim() ? { title } : {}) }));
    } catch (e) {
      setError(errorText(e, "Couldn't create the note."));
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New note"
      labelledBy="new-note-title"
      footer={
        <>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="filled" disabled={busy || !courseId} type="submit" form="new-note-form">
            {busy ? "Creating…" : "Start writing"}
          </Button>
        </>
      }
    >
      <form
        id="new-note-form"
        className={styles.formGrid}
        onSubmit={(e) => void onSubmit(e)}
        noValidate
      >
        <TextField
          label="Title (optional)"
          value={title}
          onChange={(e) => {
            setTitle(e.currentTarget.value);
          }}
          maxLength={200}
          autoComplete="off"
        />
        <CourseSelect courses={courses} value={courseId} onChange={setCourseId} />
        {error ? (
          <p role="alert" className={styles.formError}>
            <Icon name="warning" size={18} />
            {error}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}
