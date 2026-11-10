// "Add a course" without a syllabus: a name, and optionally a code, instructor, and a color
// from the vetted palette. The free plan's course limit is enforced by the server; the
// message says what to do about it. The form is rebuilt each time the sheet opens, so it
// always starts empty.
import { ApiError } from "@studypulse/core/api";
import { coursePalette, nextCourseColor } from "@studypulse/tokens/native";
import { useState } from "react";
import { Text } from "react-native";

import { errorMessage } from "../lib/errors";
import { getApi } from "../lib/supabase";
import { useAppTheme } from "../theme";
import { Button, ChoiceChips, Sheet, TextField } from "./ui";

interface Props {
  usedColors: readonly (string | null)[];
  onClose: () => void;
  onCreated: (course: { id: string; name: string; code: string | null }) => void;
}

export function AddCourseSheet({ visible, ...props }: Props & { visible: boolean }) {
  return (
    <Sheet visible={visible} title="Add a course" onClose={props.onClose}>
      <Form {...props} />
    </Sheet>
  );
}

function Form({ usedColors, onClose, onCreated }: Props) {
  const theme = useAppTheme();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [instructor, setInstructor] = useState("");
  const [color, setColor] = useState<string | null>(() =>
    nextCourseColor(usedColors.filter((c): c is string => c !== null)),
  );
  const [nameError, setNameError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!name.trim()) {
      setNameError("Name the course.");
      return;
    }
    setNameError(null);
    setError(null);
    setBusy(true);
    try {
      onCreated(
        await getApi().courses.create({
          name,
          ...(code.trim() ? { code } : {}),
          ...(instructor.trim() ? { instructor } : {}),
          ...(color ? { color } : {}),
        }),
      );
    } catch (e) {
      setError(
        e instanceof ApiError && e.code === "course_limit_reached"
          ? "The free plan includes 3 active courses. Archive one or upgrade to Pro."
          : errorMessage(e, "Couldn't add the course."),
      );
      setBusy(false);
    }
  }

  return (
    <>
      <TextField
        label="Course name"
        value={name}
        onChangeText={setName}
        error={nameError}
        maxLength={200}
        autoCapitalize="words"
      />
      <TextField
        label="Course code (optional)"
        hint="Shown on chips and cards, such as BIO 201."
        value={code}
        onChangeText={setCode}
        maxLength={50}
        autoCapitalize="characters"
      />
      <TextField
        label="Instructor (optional)"
        value={instructor}
        onChangeText={setInstructor}
        maxLength={200}
        autoCapitalize="words"
      />
      <ChoiceChips
        label="Color"
        options={coursePalette.map((c) => ({ value: c.hex, label: c.label }))}
        value={color}
        onChange={setColor}
      />
      {error ? (
        <Text
          accessibilityRole="alert"
          style={[theme.type.labelLarge, { color: theme.colors.error }]}
        >
          {error}
        </Text>
      ) : null}
      <Button label={busy ? "Adding…" : "Add course"} disabled={busy} onPress={() => void save()} />
      <Button label="Cancel" variant="text" onPress={onClose} />
    </>
  );
}
