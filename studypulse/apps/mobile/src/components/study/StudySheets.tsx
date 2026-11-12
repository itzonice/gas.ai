// Bottom sheets for the Study tab: a new card set and a new note, both started from a
// course, and a yes/no confirmation. Without a course there is nothing to attach them
// to, so the tab offers to add one first.
import type { StudyCourse } from "@studypulse/core/api";
import { useState } from "react";
import { Text } from "react-native";

import { errorMessage } from "../../lib/errors";
import { getApi } from "../../lib/supabase";
import { useAppTheme } from "../../theme";
import { Button, ChoiceChips, Sheet, TextField } from "../ui";

const courseLabel = (c: StudyCourse) => (c.code ? `${c.code} ${c.name}` : c.name);

function CoursePicker({
  courses,
  value,
  onChange,
}: {
  courses: readonly StudyCourse[];
  value: string | null;
  onChange: (id: string) => void;
}) {
  return (
    <ChoiceChips
      label="Course"
      value={value}
      onChange={onChange}
      options={courses.map((c) => ({ value: c.id, label: courseLabel(c) }))}
    />
  );
}

function ErrorText({ message }: { message: string | null }) {
  const theme = useAppTheme();
  return message ? (
    <Text accessibilityRole="alert" style={[theme.type.labelLarge, { color: theme.colors.error }]}>
      {message}
    </Text>
  ) : null;
}

interface CreateProps<T> {
  courses: readonly StudyCourse[];
  defaultCourseId?: string | undefined;
  onClose: () => void;
  onCreated: (created: T) => void;
}

export function NewSetSheet({
  visible,
  ...props
}: CreateProps<{ id: string }> & { visible: boolean }) {
  return (
    <Sheet visible={visible} title="New card set" onClose={props.onClose}>
      <NewSetForm {...props} />
    </Sheet>
  );
}

function NewSetForm({ courses, defaultCourseId, onClose, onCreated }: CreateProps<{ id: string }>) {
  const [courseId, setCourseId] = useState<string | null>(
    defaultCourseId ?? courses[0]?.id ?? null,
  );
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [titleError, setTitleError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create() {
    if (!title.trim()) {
      setTitleError("Name the set.");
      return;
    }
    if (!courseId) return;
    setTitleError(null);
    setError(null);
    setBusy(true);
    try {
      onCreated(
        await getApi().sets.create({
          courseId,
          title,
          ...(description.trim() ? { description } : {}),
        }),
      );
    } catch (e) {
      setError(errorMessage(e, "Couldn't create the set."));
      setBusy(false);
    }
  }

  return (
    <>
      <TextField
        label="Set name"
        hint="For example, Chapter 5 vocabulary."
        value={title}
        onChangeText={setTitle}
        error={titleError}
        maxLength={120}
      />
      <CoursePicker courses={courses} value={courseId} onChange={setCourseId} />
      <TextField
        label="Description (optional)"
        value={description}
        onChangeText={setDescription}
        maxLength={500}
        multiline
      />
      <ErrorText message={error} />
      <Button
        label={busy ? "Creating…" : "Create set"}
        disabled={busy || !courseId}
        onPress={() => void create()}
      />
      <Button label="Cancel" variant="text" onPress={onClose} />
    </>
  );
}

export function NewNoteSheet({
  visible,
  ...props
}: CreateProps<{ id: string }> & { visible: boolean }) {
  return (
    <Sheet visible={visible} title="New note" onClose={props.onClose}>
      <NewNoteForm {...props} />
    </Sheet>
  );
}

function NewNoteForm({
  courses,
  defaultCourseId,
  onClose,
  onCreated,
}: CreateProps<{ id: string }>) {
  const [courseId, setCourseId] = useState<string | null>(
    defaultCourseId ?? courses[0]?.id ?? null,
  );
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create() {
    if (!courseId) return;
    setError(null);
    setBusy(true);
    try {
      onCreated(await getApi().notes.create({ courseId, ...(title.trim() ? { title } : {}) }));
    } catch (e) {
      setError(errorMessage(e, "Couldn't create the note."));
      setBusy(false);
    }
  }

  return (
    <>
      <TextField label="Title (optional)" value={title} onChangeText={setTitle} maxLength={200} />
      <CoursePicker courses={courses} value={courseId} onChange={setCourseId} />
      <ErrorText message={error} />
      <Button
        label={busy ? "Creating…" : "Start writing"}
        disabled={busy || !courseId}
        onPress={() => void create()}
      />
      <Button label="Cancel" variant="text" onPress={onClose} />
    </>
  );
}

/** A yes/no confirmation for the few things that can't be undone. */
export function ConfirmSheet({
  visible,
  title,
  message,
  confirmLabel,
  danger,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const theme = useAppTheme();
  return (
    <Sheet visible={visible} title={title} onClose={onClose}>
      <Text style={[theme.type.bodyLarge, { color: theme.colors.onSurface }]}>{message}</Text>
      <Button label={confirmLabel} variant={danger ? "danger" : "filled"} onPress={onConfirm} />
      <Button label="Cancel" variant="text" onPress={onClose} />
    </Sheet>
  );
}
