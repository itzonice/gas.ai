// "Review your schedule": the parsed syllabus as an editable list, low-confidence items
// first. Each item opens a sheet to fix its title, date, and time, confirm it, or leave
// it out. "Save to calendar" commits the reviewed draft (the same model and payload as
// the web review screen, from @studypulse/core/syllabus).
import { ApiError } from "@studypulse/core/api";
import { itemDateText, KIND_LABELS } from "@studypulse/core/screens";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  draftChanged,
  draftToPayload,
  needsReview,
  parseResultSchema,
  parseSavedDraft,
  savedDraftKey,
  serializeDraft,
  toReviewDraft,
  totalWeight,
  type DraftIssue,
  type ReviewDraft,
  type ReviewItem,
} from "@studypulse/core/syllabus";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import { ListCard, SectionHeading, TabScreen } from "../../../components/TabScreen";
import {
  Button,
  EmptyState,
  Icon,
  MetricCard,
  MetricGrid,
  Notice,
  Sheet,
  TextField,
} from "../../../components/ui";
import { errorMessage } from "../../../lib/errors";
import { announce } from "../../../lib/hooks";
import { getApi } from "../../../lib/supabase";
import { useAppTheme } from "../../../theme";

type Load =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "committed"; courseId: string | null }
  | { status: "unreadable" }
  | { status: "ready"; uploadId: string; original: ReviewDraft; draft: ReviewDraft };

export default function ReviewScreen() {
  const theme = useAppTheme();
  const { uploadId } = useLocalSearchParams<{ uploadId: string }>();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [issues, setIssues] = useState<DraftIssue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const row = await getApi().syllabus.get(uploadId);
        if (!live) return;
        if (row.status === "committed") {
          setLoad({ status: "committed", courseId: row.course_id });
          return;
        }
        const parsed = parseResultSchema.safeParse(row.parse_result);
        if (!parsed.success) {
          setLoad({ status: "unreadable" });
          return;
        }
        // Autosave (L3): edits are kept on this device until saved, and restored here.
        const original = toReviewDraft(parsed.data);
        const saved = parseSavedDraft(
          await AsyncStorage.getItem(savedDraftKey(row.id)).catch(() => null),
          row.id,
        );
        if (!live) return;
        setLoad({ status: "ready", uploadId: row.id, original, draft: saved ?? original });
        if (saved) setNote("Your unsaved changes to this review were restored.");
      } catch (e) {
        if (live) setLoad({ status: "error", message: errorMessage(e) });
      }
    })();
    return () => {
      live = false;
    };
  }, [uploadId]);

  const readyDraft = load.status === "ready" ? load : null;
  useEffect(() => {
    if (!readyDraft) return;
    const key = savedDraftKey(readyDraft.uploadId);
    const write = draftChanged(readyDraft.original, readyDraft.draft)
      ? AsyncStorage.setItem(key, serializeDraft(readyDraft.uploadId, readyDraft.draft))
      : AsyncStorage.removeItem(key);
    write.catch(() => undefined);
  }, [readyDraft]);

  const frame = (
    children: ReactNode,
    extra?: { primary?: { label: string; onPress: () => void } },
  ) => (
    <TabScreen
      title="Review your schedule"
      settings={false}
      topInset={false}
      bottomSpace={false}
      loading={load.status === "loading"}
      error={load.status === "error" ? load.message : null}
      {...(extra?.primary ? { primaryAction: extra.primary } : {})}
    >
      {children}
    </TabScreen>
  );

  if (load.status === "committed") {
    return frame(
      <EmptyState
        icon="check"
        title="Already saved"
        body="This syllabus is already on your calendar."
        action={{
          label: load.courseId ? "Open course" : "Go to courses",
          onPress: () => {
            router.replace(load.courseId ? `/courses/${load.courseId}` : "/courses");
          },
        }}
      />,
    );
  }
  if (load.status === "unreadable") {
    return frame(
      <EmptyState
        icon="warning-amber"
        title="This parse can't be reviewed"
        body="The saved result is in a format this version of StudyPulse doesn't understand. Add the syllabus again."
        action={{
          label: "Add it again",
          onPress: () => {
            router.replace("/courses/upload");
          },
        }}
      />,
    );
  }
  if (load.status !== "ready") return frame(null);

  const { draft } = load;
  const setDraft = (update: (d: ReviewDraft) => ReviewDraft) => {
    setLoad((l) => (l.status === "ready" ? { ...l, draft: update(l.draft) } : l));
  };
  const patchItem = (key: string, patch: Partial<ReviewItem>) => {
    setDraft((d) => ({
      ...d,
      items: d.items.map((i) => (i.key === key ? { ...i, ...patch } : i)),
    }));
  };
  const toReview = draft.items.filter(needsReview);
  const included = draft.items.filter((i) => !i.excluded);
  const openItem = draft.items.find((i) => i.key === openKey) ?? null;
  const weight = totalWeight(draft.categories);
  const itemIssues = (key: string) => issues.filter((i) => i.itemKey === key).map((i) => i.message);

  async function save() {
    if (load.status !== "ready") return;
    setError(null);
    const out = draftToPayload(draft);
    if (!out.ok) {
      setIssues(out.issues);
      const text =
        out.issues.length === 1
          ? "Fix 1 problem before saving."
          : `Fix ${String(out.issues.length)} problems before saving.`;
      setError(text);
      announce(text);
      return;
    }
    setIssues([]);
    setSaving(true);
    try {
      const courseId = await getApi().syllabus.commit(load.uploadId, out.payload);
      await AsyncStorage.removeItem(savedDraftKey(load.uploadId)).catch(() => undefined);
      announce("Saved to your calendar.");
      router.replace(`/courses/${courseId}`);
    } catch (e) {
      setSaving(false);
      setError(
        e instanceof ApiError && e.code === "course_limit_reached"
          ? `${e.message} You can upgrade in Settings.`
          : errorMessage(e, "Couldn't save. Try again."),
      );
    }
  }

  const courseIssues = issues.filter((i) => i.path.startsWith("course.")).map((i) => i.message);
  const otherIssues = issues.filter((i) => !i.itemKey && !i.path.startsWith("course."));

  return frame(
    <>
      <MetricGrid>
        <MetricCard
          label="Items found"
          value={draft.items.length}
          detail={`${String(included.length)} will be saved`}
        />
        <MetricCard
          label="Need a look"
          value={toReview.length}
          {...(toReview.length
            ? { status: { tone: "error" as const, text: "Check these first" } }
            : { detail: "Everything is checked" })}
        />
      </MetricGrid>
      {note ? <Notice>{note}</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {otherIssues.map((i) => (
        <Notice key={i.path} tone="error">
          {i.message}
        </Notice>
      ))}

      <View style={{ gap: theme.spacing.card }}>
        <SectionHeading>Course</SectionHeading>
        <TextField
          label="Course name"
          value={draft.course.name}
          error={courseIssues[0] ?? null}
          onChangeText={(name) => {
            setDraft((d) => ({ ...d, course: { ...d.course, name } }));
          }}
        />
        <TextField
          label="Course code"
          hint="For example BIO 201"
          value={draft.course.code}
          onChangeText={(code) => {
            setDraft((d) => ({ ...d, course: { ...d.course, code } }));
          }}
        />
      </View>

      <View style={{ gap: theme.spacing.related }}>
        <SectionHeading>Grade categories</SectionHeading>
        {draft.categories.length ? (
          <>
            {draft.categories.map((c) => (
              <Text key={c.key} style={[theme.type.bodyLarge, { color: theme.colors.onSurface }]}>
                {c.name || "(unnamed)"} · {c.weight === null ? "no weight" : `${String(c.weight)}%`}
                {c.drop_lowest ? ` · lowest ${String(c.drop_lowest)} dropped` : ""}
              </Text>
            ))}
            {Math.round(weight) !== 100 ? (
              <Text style={[theme.type.body, { color: theme.colors.onSurfaceVariant }]}>
                Weights add up to {Math.round(weight * 100) / 100}%. You can change categories on
                the web app.
              </Text>
            ) : null}
          </>
        ) : (
          <Text style={[theme.type.body, { color: theme.colors.onSurfaceVariant }]}>
            None found. Everything counts equally by points.
          </Text>
        )}
      </View>

      <View style={{ gap: theme.spacing.related }}>
        <SectionHeading>Items</SectionHeading>
        <ListCard label="Items">
          {draft.items.map((item, i) => {
            const flagged = needsReview(item);
            const problems = itemIssues(item.key);
            return (
              <Pressable
                key={item.key}
                accessibilityRole="button"
                accessibilityHint="Opens the item to check or edit it"
                accessibilityLabel={[
                  item.title,
                  KIND_LABELS[item.kind],
                  itemDateText(item),
                  item.excluded ? "Left out" : null,
                  flagged ? `Needs a look: ${item.reasons.join(", ") || "low confidence"}` : null,
                  item.checked ? "Checked" : null,
                  ...problems,
                ]
                  .filter(Boolean)
                  .join(". ")}
                onPress={() => {
                  setOpenKey(item.key);
                }}
                style={({ pressed }) => ({
                  gap: 2,
                  minHeight: 48,
                  paddingVertical: 12,
                  paddingHorizontal: theme.spacing.card,
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderTopColor: theme.colors.outlineVariant,
                  backgroundColor: theme.colors.surfaceContainerLow,
                  opacity: pressed ? 0.7 : item.excluded ? 0.6 : 1,
                })}
              >
                <Text
                  style={[
                    theme.type.cardTitle,
                    {
                      color: theme.colors.onSurface,
                      textDecorationLine: item.excluded ? "line-through" : "none",
                    },
                  ]}
                >
                  {item.title || "Untitled item"}
                </Text>
                <Text style={[theme.type.body, { color: theme.colors.onSurfaceVariant }]}>
                  {KIND_LABELS[item.kind]} · {itemDateText(item)}
                  {item.excluded ? " · Left out" : item.checked ? " · Checked" : ""}
                </Text>
                {flagged || problems.length ? (
                  <View
                    style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.half }}
                  >
                    <Icon name="warning-amber" size={16} color={theme.colors.error} />
                    <Text
                      style={[theme.type.labelLarge, { color: theme.colors.error, flexShrink: 1 }]}
                    >
                      {problems[0] ?? item.reasons[0] ?? "Check this item"}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </ListCard>
      </View>

      <ItemSheet
        item={openItem}
        onClose={() => {
          setOpenKey(null);
        }}
        onSave={(key, patch) => {
          patchItem(key, patch);
          setOpenKey(null);
        }}
      />
    </>,
    {
      primary: {
        label: saving ? "Saving…" : "Save to calendar",
        onPress: () => void (saving ? undefined : save()),
      },
    },
  );
}

const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function ItemSheet({
  item,
  onClose,
  onSave,
}: {
  item: ReviewItem | null;
  onClose: () => void;
  onSave: (key: string, patch: Partial<ReviewItem>) => void;
}) {
  const theme = useAppTheme();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [errors, setErrors] = useState<{ title?: string; date?: string; time?: string }>({});
  const [shownKey, setShownKey] = useState<string | null>(null);

  // Reset the fields when a different item opens (during render, not in an effect).
  if (item && item.key !== shownKey) {
    setShownKey(item.key);
    setTitle(item.title);
    setDate(item.due_date ?? "");
    setTime(item.due_time ?? "");
    setErrors({});
  } else if (!item && shownKey !== null) {
    // Closed: reopening the same item starts from its saved values, not a cancelled edit.
    setShownKey(null);
  }

  if (!item) return null;

  function apply(extra: Partial<ReviewItem>) {
    if (!item) return;
    const next: typeof errors = {};
    if (!title.trim()) next.title = "Give it a title.";
    if (date && !(DATE.test(date) && !Number.isNaN(Date.parse(`${date}T00:00:00Z`))))
      next.date = "Use the form 2026-10-01, or leave it empty for no date.";
    if (time && !TIME.test(time))
      next.time = "Use 24-hour time like 17:00, or leave it empty for 11:59 PM.";
    setErrors(next);
    if (Object.keys(next).length) return;
    onSave(item.key, {
      title: title.trim(),
      due_date: date || null,
      due_time: time || null,
      ...extra,
    });
  }

  return (
    <Sheet visible title="Check this item" onClose={onClose}>
      {item.reasons.length ? <Notice>{item.reasons.join(". ")}.</Notice> : null}
      {item.source_quote ? (
        <Text style={[theme.type.body, { color: theme.colors.onSurfaceVariant }]}>
          From the syllabus: “{item.source_quote}”
        </Text>
      ) : null}
      <TextField label="Title" value={title} onChangeText={setTitle} error={errors.title ?? null} />
      <TextField
        label="Due date"
        hint="YYYY-MM-DD, or empty for no date"
        value={date}
        onChangeText={setDate}
        error={errors.date ?? null}
        autoCapitalize="none"
        keyboardType="numbers-and-punctuation"
      />
      <TextField
        label="Due time"
        hint="24-hour HH:MM, or empty for 11:59 PM"
        value={time}
        onChangeText={setTime}
        error={errors.time ?? null}
        keyboardType="numbers-and-punctuation"
      />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.layout.targetGap }}>
        <Button
          label="Looks right"
          onPress={() => {
            apply({ checked: true, excluded: false });
          }}
        />
        <Button
          variant="tonal"
          label={item.excluded ? "Add it back" : "Leave it out"}
          onPress={() => {
            apply({ excluded: !item.excluded });
          }}
        />
        <Button variant="text" label="Cancel" onPress={onClose} />
      </View>
    </Sheet>
  );
}
