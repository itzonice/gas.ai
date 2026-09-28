// Add an assignment by hand (from the calendar or a course). The due date and time are
// the student's local time, converted to UTC in their profile timezone; the server
// validates again and replans around it.
import { ApiError } from "@studypulse/core/api";
import { KIND_LABELS } from "@studypulse/core/screens";
import { ASSIGNMENT_KINDS } from "@studypulse/core/syllabus";
import { localDate, zonedTimeToUtc } from "@studypulse/core/time";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { View } from "react-native";

import { TabScreen } from "../../components/TabScreen";
import { Button, ChoiceChips, EmptyState, Notice, TextField } from "../../components/ui";
import { errorMessage } from "../../lib/errors";
import { announce, useLoad } from "../../lib/hooks";
import { getApi } from "../../lib/supabase";
import { useAppTheme } from "../../theme";

type Errors = Partial<Record<"courseId" | "title" | "dueDate" | "dueTime" | "form", string>>;
const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export default function NewAssignmentScreen() {
  const theme = useAppTheme();
  const params = useLocalSearchParams<{ date?: string; courseId?: string }>();
  const { data, error } = useLoad(useCallback(() => getApi().courses.overview(), []));
  const [courseId, setCourseId] = useState<string | null>(params.courseId ?? null);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<(typeof ASSIGNMENT_KINDS)[number]>("assignment");
  const [dueDate, setDueDate] = useState(
    params.date && DATE.test(params.date)
      ? params.date
      : localDate(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"),
  );
  const [dueTime, setDueTime] = useState("23:59");
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  const courses = data?.courses ?? [];
  const chosen = courseId ?? (courses.length === 1 ? (courses[0]?.id ?? null) : null);

  async function save() {
    if (!data) return;
    const next: Errors = {};
    if (!chosen) next.courseId = "Choose a course.";
    if (!title.trim()) next.title = "Give it a title.";
    if (!DATE.test(dueDate) || Number.isNaN(Date.parse(`${dueDate}T00:00:00Z`)))
      next.dueDate = "Use the form 2026-10-01.";
    if (!TIME.test(dueTime)) next.dueTime = "Use 24-hour time like 17:00.";
    setErrors(next);
    if (Object.keys(next).length || !chosen) return;
    setBusy(true);
    try {
      await getApi().assignments.create({
        courseId: chosen,
        title: title.trim(),
        kind,
        dueAt: zonedTimeToUtc(dueDate, dueTime, data.timezone).toISOString(),
      });
      announce(`${title.trim()} added.`);
      router.back();
    } catch (e) {
      if (e instanceof ApiError && e.issues.length) {
        const byField: Errors = {};
        for (const issue of e.issues) {
          const key =
            issue.path === "courseId" || issue.path === "title"
              ? issue.path
              : issue.path === "dueAt"
                ? "dueDate"
                : "form";
          byField[key] ??= issue.message;
        }
        setErrors(byField);
      } else {
        setErrors({ form: errorMessage(e, "Couldn't add it. Try again.") });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <TabScreen
      title="Add assignment"
      settings={false}
      topInset={false}
      bottomSpace={false}
      loading={!data}
      error={error}
    >
      {courses.length === 0 ? (
        <EmptyState
          icon="school"
          title="Add a course first"
          body="Assignments belong to a course. Upload a syllabus to create one."
          action={{
            label: "Upload syllabus",
            onPress: () => {
              router.replace("/courses/upload");
            },
          }}
        />
      ) : (
        <>
          <ChoiceChips
            label="Course"
            options={courses.map((c) => ({ value: c.id, label: c.code ?? c.name }))}
            value={chosen}
            onChange={setCourseId}
          />
          {errors.courseId ? <Notice tone="error">{errors.courseId}</Notice> : null}
          <TextField
            label="Title"
            value={title}
            onChangeText={setTitle}
            error={errors.title ?? null}
          />
          <ChoiceChips
            label="Type"
            options={ASSIGNMENT_KINDS.map((k) => ({ value: k, label: KIND_LABELS[k] }))}
            value={kind}
            onChange={setKind}
          />
          <TextField
            label="Due date"
            hint="YYYY-MM-DD"
            value={dueDate}
            onChangeText={setDueDate}
            error={errors.dueDate ?? null}
            keyboardType="numbers-and-punctuation"
          />
          <TextField
            label="Due time"
            hint="24-hour HH:MM, in your timezone"
            value={dueTime}
            onChangeText={setDueTime}
            error={errors.dueTime ?? null}
            keyboardType="numbers-and-punctuation"
          />
          {errors.form ? <Notice tone="error">{errors.form}</Notice> : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.layout.targetGap }}>
            <Button
              label={busy ? "Adding…" : "Add assignment"}
              disabled={busy}
              onPress={() => void save()}
            />
            <Button
              variant="text"
              label="Cancel"
              onPress={() => {
                router.back();
              }}
            />
          </View>
        </>
      )}
    </TabScreen>
  );
}
