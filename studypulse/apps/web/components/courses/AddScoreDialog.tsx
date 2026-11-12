"use client";

// "Add score": pick an assignment, enter points earned (and possible). Saving marks it
// done; the grade and plan update server-side. Typed but unsaved scores are kept per
// assignment while the page is open (closing the dialog or switching assignments doesn't
// lose them), and the browser asks before the page closes with one unsaved (L3).
import { ApiError } from "@studypulse/core/api";
import { useEffect, useState, type FormEvent } from "react";

import { useApi } from "@/components/auth/SessionProvider";
import { Button, Dialog, SelectField, TextField } from "@/components/ui";

import type { CourseAssignment } from "./CourseDetailScreen";
import styles from "./courses.module.css";

export function AddScoreDialog({
  open,
  assignments,
  onClose,
  onSaved,
}: {
  open: boolean;
  assignments: readonly CourseAssignment[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const api = useApi();
  // Ungraded first (soonest due), then graded ones to correct a score.
  const ordered = [
    ...assignments.filter((a) => a.points_earned === null),
    ...assignments.filter((a) => a.points_earned !== null),
  ];
  const [id, setId] = useState("");
  const [earned, setEarned] = useState("");
  const [possible, setPossible] = useState("");
  const [errors, setErrors] = useState<Partial<Record<"earned" | "possible" | "form", string>>>({});
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, ScoreFields>>({});
  const selected = assignments.find((a) => a.id === id);
  const dirty =
    !!selected &&
    (earned !== savedFields(selected).earned || possible !== savedFields(selected).possible);
  const restored = !!selected && drafts[selected.id] !== undefined && dirty;

  const fieldsFor = (a: CourseAssignment | undefined) =>
    a ? (drafts[a.id] ?? savedFields(a)) : { earned: "", possible: "" };

  /** Keeps what's typed for the current assignment (or forgets it once it matches). */
  function stash() {
    if (!selected) return;
    const current = { earned, possible };
    setDrafts((d) => (dirty ? { ...d, [selected.id]: current } : omit(d, selected.id)));
  }

  useEffect(() => {
    if (!open) return;
    /* eslint-disable react-hooks/set-state-in-effect -- resetting the form on open */
    const first = ordered[0];
    const fields = fieldsFor(first);
    setId(first?.id ?? "");
    setEarned(fields.earned);
    setPossible(fields.possible);
    setErrors({});
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when it opens
  }, [open]);

  useEffect(() => {
    if (!open || !dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
    };
  }, [open, dirty]);

  function pick(nextId: string) {
    stash();
    setId(nextId);
    const fields = fieldsFor(assignments.find((x) => x.id === nextId));
    setEarned(fields.earned);
    setPossible(fields.possible);
  }

  function close() {
    stash();
    onClose();
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const e = Number(earned);
    const p = Number(possible);
    const next: typeof errors = {};
    if (earned.trim() === "" || !Number.isFinite(e) || e < 0)
      next.earned = "Enter the points you got.";
    if (possible.trim() === "" || !Number.isFinite(p) || p <= 0)
      next.possible = "Enter the points possible.";
    setErrors(next);
    if (Object.keys(next).length || !selected) return;
    setBusy(true);
    try {
      await api.assignments.update({
        id: selected.id,
        pointsEarned: e,
        pointsPossible: p,
        status: "done",
      });
      setDrafts((d) => omit(d, selected.id));
      onSaved(`Score saved for ${selected.title}.`);
    } catch (err) {
      setErrors({
        form:
          err instanceof ApiError && err.issues.length
            ? err.issues.map((i) => i.message).join(" ")
            : err instanceof Error
              ? err.message
              : "Couldn't save the score.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      labelledBy="add-score-title"
      title="Add score"
      footer={
        <>
          <Button variant="text" onClick={close}>
            Cancel
          </Button>
          <Button variant="filled" type="submit" form="add-score-form" disabled={busy || !selected}>
            {busy ? "Saving…" : "Save score"}
          </Button>
        </>
      }
    >
      {ordered.length === 0 ? (
        <p className={styles.note}>This course has no assignments yet.</p>
      ) : (
        <form
          id="add-score-form"
          noValidate
          onSubmit={(e) => void onSubmit(e)}
          style={{ display: "grid", gap: "var(--sp-space-card)" }}
        >
          {errors.form ? (
            <p role="alert" className={styles.alert}>
              {errors.form}
            </p>
          ) : null}
          {restored ? (
            <p className={styles.note}>
              This is the score you typed earlier; it isn&apos;t saved yet.
            </p>
          ) : null}
          <SelectField
            label="Assignment"
            value={id}
            onChange={(e) => {
              pick(e.currentTarget.value);
            }}
          >
            {ordered.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title}
                {a.points_earned !== null ? " (graded)" : ""}
              </option>
            ))}
          </SelectField>
          <div
            style={{
              display: "grid",
              gap: "var(--sp-space-card)",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            }}
          >
            <TextField
              label="Points earned"
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={earned}
              error={errors.earned ?? null}
              onChange={(e) => {
                setEarned(e.currentTarget.value);
              }}
            />
            <TextField
              label="Points possible"
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={possible}
              error={errors.possible ?? null}
              onChange={(e) => {
                setPossible(e.currentTarget.value);
              }}
            />
          </div>
        </form>
      )}
    </Dialog>
  );
}

interface ScoreFields {
  earned: string;
  possible: string;
}

function savedFields(a: CourseAssignment): ScoreFields {
  return {
    earned: a.points_earned === null ? "" : String(a.points_earned),
    possible: a.points_possible === null ? "" : String(a.points_possible),
  };
}

function omit(drafts: Record<string, ScoreFields>, id: string): Record<string, ScoreFields> {
  const next = { ...drafts };
  delete next[id];
  return next;
}
