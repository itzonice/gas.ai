"use client";

import { useEffect, useState, type FormEvent } from "react";

import { useApi } from "@/components/auth/SessionProvider";
import { Button, Dialog, TextField } from "@/components/ui";

/** Sets or clears the course's target grade. */
export function TargetDialog({
  open,
  courseId,
  current,
  onClose,
  onSaved,
}: {
  open: boolean;
  courseId: string;
  current: number | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const api = useApi();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    /* eslint-disable react-hooks/set-state-in-effect -- resetting the form on open */
    setValue(current === null ? "" : String(current));
    setError(null);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, current]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const n = value.trim() === "" ? null : Number(value);
    if (n !== null && (!Number.isFinite(n) || n < 0 || n > 100)) {
      setError("Enter a percent from 0 to 100, or leave it empty.");
      return;
    }
    try {
      await api.courses.setTarget({ courseId, targetGrade: n });
      onSaved(n === null ? "Target cleared." : `Target set to ${String(n)}%.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the target.");
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      labelledBy="target-title"
      title="Target grade"
      footer={
        <>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="filled" type="submit" form="target-form">
            Save
          </Button>
        </>
      }
    >
      <form id="target-form" noValidate onSubmit={(e) => void onSubmit(e)}>
        <TextField
          label="Target grade (%)"
          type="number"
          inputMode="decimal"
          min={0}
          max={100}
          step="any"
          placeholder="e.g. 90"
          hint="Leave empty for no target."
          value={value}
          error={error}
          onChange={(e) => {
            setValue(e.currentTarget.value);
          }}
        />
      </form>
    </Dialog>
  );
}
