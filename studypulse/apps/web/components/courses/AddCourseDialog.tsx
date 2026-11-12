"use client";

// "Add a course" without a syllabus: a name, and optionally a code, instructor, and color
// from the vetted palette. The free plan's course limit is enforced by the database; the
// message says what to do about it.
import { ApiError } from "@studypulse/core/api";
import { coursePalette, nextCourseColor } from "@studypulse/tokens";
import { useEffect, useState, type FormEvent } from "react";

import { useApi } from "@/components/auth/SessionProvider";
import { Button, Dialog, Icon, SelectField, TextField } from "@/components/ui";

import styles from "./courses.module.css";

export function AddCourseDialog({
  open,
  usedColors,
  onClose,
  onCreated,
}: {
  open: boolean;
  /** Colors the student's courses already use, so the new one starts with a free color. */
  usedColors: readonly (string | null)[];
  onClose: () => void;
  onCreated: (course: { id: string; name: string; code: string | null }) => void;
}) {
  const api = useApi();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [instructor, setInstructor] = useState("");
  const [color, setColor] = useState("");
  const [errors, setErrors] = useState<Partial<Record<"name" | "form", string>>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    /* eslint-disable react-hooks/set-state-in-effect -- resetting the form on open */
    setName("");
    setCode("");
    setInstructor("");
    setColor(nextCourseColor(usedColors.filter((c): c is string => c !== null)));
    setErrors({});
    setBusy(false);
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when it opens
  }, [open]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      setErrors({ name: "Name the course." });
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const course = await api.courses.create({
        name,
        ...(code.trim() ? { code } : {}),
        ...(instructor.trim() ? { instructor } : {}),
        ...(color ? { color } : {}),
      });
      onCreated(course);
    } catch (e) {
      setErrors({
        form:
          e instanceof ApiError && e.code === "course_limit_reached"
            ? "The free plan includes 3 active courses. Archive one or upgrade to Pro."
            : e instanceof Error
              ? e.message
              : "Couldn't add the course.",
      });
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add a course"
      labelledBy="add-course-title"
      footer={
        <>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="filled" disabled={busy} type="submit" form="add-course-form">
            {busy ? "Adding…" : "Add course"}
          </Button>
        </>
      }
    >
      <form
        id="add-course-form"
        className={styles.dialogForm}
        onSubmit={(e) => void onSubmit(e)}
        noValidate
      >
        <TextField
          label="Course name"
          value={name}
          onChange={(e) => {
            setName(e.currentTarget.value);
          }}
          error={errors.name ?? null}
          maxLength={200}
          autoComplete="off"
          required
        />
        <TextField
          label="Course code (optional)"
          hint="Shown on chips and cards, such as BIO 201."
          value={code}
          onChange={(e) => {
            setCode(e.currentTarget.value);
          }}
          maxLength={50}
          autoComplete="off"
        />
        <TextField
          label="Instructor (optional)"
          value={instructor}
          onChange={(e) => {
            setInstructor(e.currentTarget.value);
          }}
          maxLength={200}
          autoComplete="off"
        />
        <SelectField
          label="Color"
          hint="Used as a tint next to the course code, never on its own."
          value={color}
          onChange={(e) => {
            setColor(e.currentTarget.value);
          }}
        >
          {coursePalette.map((c) => (
            <option key={c.key} value={c.hex}>
              {c.label}
            </option>
          ))}
        </SelectField>
        {errors.form ? (
          <p role="alert" className={styles.formError}>
            <Icon name="warning" size={18} />
            {errors.form}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}
