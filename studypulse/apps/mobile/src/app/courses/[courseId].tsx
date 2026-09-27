// Course detail: current grade, target, and the score needed on the final (grade math
// from @studypulse/core/grades, the same as the web); category weights; and every
// assignment as a list. "Add score" opens a sheet; each row's checkbox marks it done,
// and swiping a row is a shortcut for the same actions as its menu.
import { ApiError, type ApiClient } from "@studypulse/core/api";
import {
  currentGrade,
  findFinalExam,
  gradeInputFromRows,
  letterFor,
  letterScaleSchema,
  scoreNeededOn,
} from "@studypulse/core/grades";
import {
  dueText,
  formatPercent,
  formatScore,
  KIND_LABELS,
  targetStatus,
} from "@studypulse/core/screens";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";

import { ListCard, SectionHeading, TabScreen } from "../../components/TabScreen";
import {
  Button,
  ChoiceChips,
  EmptyState,
  MetricCard,
  MetricGrid,
  Notice,
  Sheet,
  SwipeRow,
  TaskRow,
  TextField,
} from "../../components/ui";
import { errorMessage } from "../../lib/errors";
import { announce, useLoad } from "../../lib/hooks";
import { getApi } from "../../lib/supabase";
import { useAppTheme } from "../../theme";

type CourseDetail = Awaited<ReturnType<ApiClient["courses"]["get"]>>;
type Assignment = CourseDetail["assignments"][number];

export default function CourseDetailScreen() {
  const theme = useAppTheme();
  const { courseId } = useLocalSearchParams<{ courseId: string }>();
  const fetcher = useCallback(
    async () => ({ detail: await getApi().courses.get(courseId), now: new Date() }),
    [courseId],
  );
  const { data, error, failure, refreshing, refresh, reload } = useLoad(fetcher);
  const [scoreFor, setScoreFor] = useState<string | null>(null);
  const [targetOpen, setTargetOpen] = useState(false);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  const detail = data?.detail;
  const input = useMemo(
    () =>
      detail
        ? gradeInputFromRows(
            detail.categories,
            detail.assignments.map((a) => ({ ...a })),
          )
        : null,
    [detail],
  );

  function say(text: string, isError = false) {
    setMessage({ text, error: isError });
    announce(text);
  }

  async function toggle(a: Assignment, next: boolean) {
    setDone((s) => ({ ...s, [a.id]: next }));
    try {
      await getApi().assignments.update({ id: a.id, status: next ? "done" : "todo" });
      say(next ? `${a.title} marked done.` : `${a.title} marked not done.`);
    } catch {
      setDone((s) => ({ ...s, [a.id]: !next }));
      say(`Couldn't update ${a.title}. Try again.`, true);
    }
  }

  const title = detail
    ? detail.course.code
      ? `${detail.course.code} ${detail.course.name}`
      : detail.course.name
    : "Course";
  const notFound = failure instanceof ApiError && failure.status === 404;

  const header = <Stack.Screen options={{ title: detail?.course.code ?? "Course" }} />;
  if (!detail || !input) {
    return (
      <>
        {header}
        <TabScreen
          title={title}
          settings={false}
          topInset={false}
          loading={!notFound}
          error={notFound ? null : error}
          onRefresh={() => void refresh()}
        >
          {notFound ? (
            <EmptyState
              icon="warning-amber"
              title="Course not found"
              body="It may have been deleted, or it belongs to another account."
              action={{
                label: "Back to courses",
                onPress: () => {
                  router.replace("/courses");
                },
              }}
            />
          ) : null}
        </TabScreen>
      </>
    );
  }

  const { course, categories, assignments, timezone } = detail;
  const now = data.now;
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
  const byCategory = new Map(grade.categories.map((c) => [c.categoryId, c]));
  const totalWeight = categories.reduce((s, c) => s + Number(c.weight), 0);
  const isDone = (a: Assignment) => done[a.id] ?? (a.status === "done" || a.points_earned !== null);

  return (
    <>
      {header}
      <TabScreen
        title={title}
        {...(course.instructor ? { description: course.instructor } : {})}
        settings={false}
        topInset={false}
        primaryAction={{
          label: "Add score",
          onPress: () => {
            const first = assignments.find((a) => a.points_earned === null) ?? assignments[0];
            if (first) setScoreFor(first.id);
            else say("Add an assignment first.", true);
          },
        }}
        secondaryActions={[
          {
            label: target === null ? "Set a target grade" : "Change target grade",
            onSelect: () => {
              setTargetOpen(true);
            },
          },
          {
            label: "Add assignment",
            onSelect: () => {
              router.push({ pathname: "/assignments/new", params: { courseId: course.id } });
            },
          },
          {
            label: "Upload another syllabus",
            onSelect: () => {
              router.push("/courses/upload");
            },
          },
        ]}
        error={error}
        refreshing={refreshing}
        onRefresh={() => void refresh()}
      >
        {message ? <Notice tone={message.error ? "error" : "info"}>{message.text}</Notice> : null}
        <MetricGrid>
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
              !final || !needed
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

        <View style={{ gap: theme.spacing.related }}>
          <SectionHeading>Grade categories</SectionHeading>
          {categories.length ? (
            <>
              {categories.map((c) => {
                const weight = Number(c.weight);
                return (
                  <View key={c.id} accessible style={{ gap: theme.spacing.half }}>
                    <Text style={[theme.type.cardTitle, { color: theme.colors.onSurface }]}>
                      {c.name}
                      {c.drop_lowest ? ` · lowest ${String(c.drop_lowest)} dropped` : ""}
                    </Text>
                    <Text style={[theme.type.body, { color: theme.colors.onSurfaceVariant }]}>
                      {weight}% of grade · you: {formatPercent(byCategory.get(c.id)?.percent)}
                    </Text>
                    <View
                      importantForAccessibility="no-hide-descendants"
                      accessibilityElementsHidden
                      style={{
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: theme.colors.surfaceContainerHighest,
                      }}
                    >
                      <View
                        style={{
                          height: 8,
                          borderRadius: 4,
                          width: `${totalWeight ? (weight / totalWeight) * 100 : 0}%`,
                          backgroundColor: theme.colors.primary,
                        }}
                      />
                    </View>
                  </View>
                );
              })}
              {Math.round(totalWeight) !== 100 ? (
                <Text style={[theme.type.body, { color: theme.colors.onSurfaceVariant }]}>
                  Weights add up to {Math.round(totalWeight * 100) / 100}%; grades are scaled to the
                  categories you have.
                </Text>
              ) : null}
            </>
          ) : (
            <Text style={[theme.type.body, { color: theme.colors.onSurfaceVariant }]}>
              No grade categories. Everything counts equally by points.
            </Text>
          )}
        </View>

        <View style={{ gap: theme.spacing.related }}>
          <SectionHeading>Assignments</SectionHeading>
          {assignments.length ? (
            <ListCard label="Assignments">
              {assignments.map((a, i) => {
                const checked = isDone(a);
                const overdue =
                  !checked &&
                  a.status !== "skipped" &&
                  !!a.due_at &&
                  Date.parse(a.due_at) < now.getTime();
                return (
                  <SwipeRow
                    key={a.id}
                    right={{
                      label: checked ? "Mark not done" : "Mark done",
                      icon: checked ? "undo" : "check",
                      onAction: () => void toggle(a, !checked),
                    }}
                    left={{
                      label: "Add score",
                      icon: "edit",
                      onAction: () => {
                        setScoreFor(a.id);
                      },
                    }}
                  >
                    <TaskRow
                      isFirst={i === 0}
                      title={a.title}
                      course={{ code: course.code ?? course.name, colorHex: course.color }}
                      done={checked}
                      overdue={overdue}
                      dueText={dueText(a.due_at, timezone, now)}
                      meta={`${KIND_LABELS[a.kind as keyof typeof KIND_LABELS] ?? "Assignment"} · ${formatScore(a.points_earned, a.points_possible)}`}
                      onToggleDone={(next) => void toggle(a, next)}
                      onOpen={() => {
                        setScoreFor(a.id);
                      }}
                      menuItems={[
                        {
                          label: "Add score",
                          onSelect: () => {
                            setScoreFor(a.id);
                          },
                        },
                        {
                          label: "Start focus on this",
                          onSelect: () => {
                            router.push({
                              pathname: "/focus",
                              params: { assignmentId: a.id, start: "1" },
                            });
                          },
                        },
                      ]}
                    />
                  </SwipeRow>
                );
              })}
            </ListCard>
          ) : (
            <EmptyState
              icon="assignment"
              title="No assignments yet"
              action={{
                label: "Add assignment",
                onPress: () => {
                  router.push({ pathname: "/assignments/new", params: { courseId: course.id } });
                },
              }}
            />
          )}
        </View>
      </TabScreen>

      <ScoreSheet
        assignments={assignments}
        selectedId={scoreFor}
        onSelect={setScoreFor}
        onClose={() => {
          setScoreFor(null);
        }}
        onSaved={(text) => {
          setScoreFor(null);
          say(text);
          void reload();
        }}
      />
      <TargetSheet
        visible={targetOpen}
        courseId={course.id}
        current={target}
        onClose={() => {
          setTargetOpen(false);
        }}
        onSaved={(text) => {
          setTargetOpen(false);
          say(text);
          void reload();
        }}
      />
    </>
  );
}

const numberOrNull = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));

function ScoreSheet({
  assignments,
  selectedId,
  onSelect,
  onClose,
  onSaved,
}: {
  assignments: readonly Assignment[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const theme = useAppTheme();
  const selected = assignments.find((a) => a.id === selectedId) ?? null;
  const [shownId, setShownId] = useState<string | null>(null);
  const [earned, setEarned] = useState("");
  const [possible, setPossible] = useState("");
  const [errors, setErrors] = useState<{ earned?: string; possible?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);

  // Fill the fields from the chosen assignment (during render, when the choice changes).
  if (selected && selected.id !== shownId) {
    setShownId(selected.id);
    setEarned(selected.points_earned === null ? "" : String(Number(selected.points_earned)));
    setPossible(selected.points_possible === null ? "" : String(Number(selected.points_possible)));
    setErrors({});
  } else if (!selected && shownId !== null) {
    setShownId(null);
  }

  async function save() {
    if (!selected) return;
    const e = numberOrNull(earned);
    const p = numberOrNull(possible);
    const next: typeof errors = {};
    if (e === null || !Number.isFinite(e) || e < 0) next.earned = "Enter the points you got.";
    if (p === null || !Number.isFinite(p) || p <= 0) next.possible = "Enter the points possible.";
    setErrors(next);
    if (Object.keys(next).length || e === null || p === null) return;
    setBusy(true);
    try {
      await getApi().assignments.update({
        id: selected.id,
        pointsEarned: e,
        pointsPossible: p,
        status: "done",
      });
      onSaved(`Score saved for ${selected.title}.`);
    } catch (err) {
      setErrors({ form: errorMessage(err, "Couldn't save the score.") });
    } finally {
      setBusy(false);
    }
  }

  // Ungraded first (soonest due), then graded ones to correct a score.
  const ordered = [
    ...assignments.filter((a) => a.points_earned === null),
    ...assignments.filter((a) => a.points_earned !== null),
  ];
  // A dozen chips at most; the one opened from a row is always among them.
  const shortlist = ordered.slice(0, 12);
  if (selected && !shortlist.includes(selected)) shortlist.unshift(selected);

  return (
    <Sheet visible={selected !== null} title="Add a score" onClose={onClose}>
      <ChoiceChips
        label="Assignment"
        options={shortlist.map((a) => ({ value: a.id, label: a.title }))}
        value={selectedId}
        onChange={onSelect}
      />
      <TextField
        label="Points you got"
        keyboardType="decimal-pad"
        value={earned}
        onChangeText={setEarned}
        error={errors.earned ?? null}
      />
      <TextField
        label="Points possible"
        keyboardType="decimal-pad"
        value={possible}
        onChangeText={setPossible}
        error={errors.possible ?? null}
      />
      {errors.form ? <Notice tone="error">{errors.form}</Notice> : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.layout.targetGap }}>
        <Button
          label={busy ? "Saving…" : "Save score"}
          disabled={busy}
          onPress={() => void save()}
        />
        <Button variant="text" label="Cancel" onPress={onClose} />
      </View>
    </Sheet>
  );
}

function TargetSheet({
  visible,
  courseId,
  current,
  onClose,
  onSaved,
}: {
  visible: boolean;
  courseId: string;
  current: number | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const theme = useAppTheme();
  const [value, setValue] = useState(current === null ? "" : String(current));
  const [wasVisible, setWasVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setValue(current === null ? "" : String(current));
      setError(null);
    }
  }

  async function save(clear = false) {
    const n = clear ? null : numberOrNull(value);
    if (!clear && (n === null || !Number.isFinite(n) || n < 0 || n > 100)) {
      setError("Enter a percentage from 0 to 100.");
      return;
    }
    setBusy(true);
    try {
      await getApi().courses.setTarget({ courseId, targetGrade: n });
      onSaved(n === null ? "Target cleared." : `Target set to ${formatPercent(n)}.`);
    } catch (e) {
      setError(errorMessage(e, "Couldn't save the target."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet visible={visible} title="Target grade" onClose={onClose}>
      <TextField
        label="Target (%)"
        hint="The grade you're aiming for, e.g. 90"
        keyboardType="decimal-pad"
        value={value}
        onChangeText={setValue}
        error={error}
      />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.layout.targetGap }}>
        <Button
          label={busy ? "Saving…" : "Save target"}
          disabled={busy}
          onPress={() => void save()}
        />
        {current !== null ? (
          <Button
            variant="tonal"
            label="Clear target"
            disabled={busy}
            onPress={() => void save(true)}
          />
        ) : null}
        <Button variant="text" label="Cancel" onPress={onClose} />
      </View>
    </Sheet>
  );
}
