// Study: due cards first, then the student's card sets and notes (get_study_overview).
// The primary action reviews what's due. The overview is saved as it arrives, so the tab
// still shows (and the sets still open) without a connection.
import { studyOverviewSchema, type StudyOverview } from "@studypulse/core/api";
import { noteTitle, plainExcerpt, setSummary } from "@studypulse/core/study";
import { courseSwatch } from "@studypulse/tokens/native";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { AddCourseSheet } from "../../components/AddCourseSheet";
import { NewNoteSheet, NewSetSheet } from "../../components/study/StudySheets";
import { SectionHeading, TabScreen } from "../../components/TabScreen";
import {
  ChoiceChips,
  EmptyState,
  Icon,
  MetricCard,
  MetricGrid,
  OverflowMenu,
  useUndoDelete,
} from "../../components/ui";
import { useLoad, useWindowClass } from "../../lib/hooks";
import { cached } from "../../lib/offline";
import { getApi } from "../../lib/supabase";
import { useAppTheme } from "../../theme";

async function loadStudy() {
  return await cached("study.overview", studyOverviewSchema, () => getApi().study.overview());
}

const when = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

export default function StudyScreen() {
  const theme = useAppTheme();
  const size = useWindowClass();
  const { data, error, refreshing, refresh, reload } = useLoad(loadStudy);
  const [dialog, setDialog] = useState<"set" | "note" | "course" | null>(null);
  const [filter, setFilter] = useState("");
  const [failed, setFailed] = useState<string | null>(null);
  const undo = useUndoDelete({
    onError: () => {
      setFailed("Couldn't delete that. It's back in your list.");
    },
    onCommitted: () => void reload(),
    bottom: 56 + theme.spacing.related,
  });

  const courses = data?.courses ?? [];
  const due = (data?.sets ?? []).reduce((n, s) => n + s.due, 0);
  const open = (kind: "set" | "note") => {
    setDialog(courses.length === 0 ? "course" : kind);
  };
  const course = (id: string) => courses.find((c) => c.id === id);
  const selected = filter && courses.some((c) => c.id === filter) ? filter : "";
  const sets = (data?.sets ?? [])
    .filter((s) => !undo.hidden.has(s.id))
    .filter((s) => !selected || s.course_id === selected);
  const notes = (data?.notes ?? [])
    .filter((n) => !undo.hidden.has(n.id))
    .filter((n) => !selected || n.course_id === selected);

  const card = (
    key: string,
    colorHex: string | null | undefined,
    label: string,
    body: React.ReactNode,
    onPress: () => void,
    menu: { label: string; onSelect: () => void; destructive?: boolean }[],
    menuLabel: string,
  ) => (
    <View key={key} style={{ flexBasis: size === "compact" ? "100%" : "47%", flexGrow: 1 }}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={label}
        onPress={onPress}
        style={({ pressed }) => ({
          gap: theme.spacing.half,
          padding: theme.spacing.card,
          paddingRight: theme.layout.minTarget + theme.spacing.related,
          borderRadius: theme.radii.card,
          borderLeftWidth: theme.layout.courseStripe,
          borderLeftColor: courseSwatch(colorHex, theme.name).stripe,
          backgroundColor: theme.colors.surfaceContainer,
          opacity: pressed ? 0.8 : 1,
        })}
      >
        {body}
      </Pressable>
      <View style={{ position: "absolute", top: theme.spacing.half, right: theme.spacing.half }}>
        <OverflowMenu label={menuLabel} items={menu} />
      </View>
    </View>
  );

  const study: StudyOverview | undefined = data ?? undefined;
  return (
    <View style={{ flex: 1 }}>
      <TabScreen
        title="Study"
        description="Flashcards, practice, and notes for your courses."
        primaryAction={
          due > 0
            ? {
                label: `Review ${String(due)} due`,
                onPress: () => {
                  router.push("/study/review");
                },
              }
            : {
                label: "New card set",
                onPress: () => {
                  open("set");
                },
              }
        }
        secondaryActions={[
          ...(due > 0
            ? [
                {
                  label: "New card set",
                  onSelect: () => {
                    open("set");
                  },
                },
              ]
            : []),
          {
            label: "New note",
            onSelect: () => {
              open("note");
            },
          },
          {
            label: "Add a course",
            onSelect: () => {
              setDialog("course");
            },
          },
        ]}
        loading={!study}
        error={error ?? failed}
        refreshing={refreshing}
        onRefresh={() => void refresh()}
      >
        {study ? (
          <>
            <MetricGrid>
              <MetricCard
                label="Due for review"
                value={due}
                detail={
                  due === 0
                    ? "Nothing due right now"
                    : `${String(due)} ${due === 1 ? "card" : "cards"} ready`
                }
              />
              <MetricCard
                label="Reviewed today"
                value={study.reviewed_today}
                detail={study.reviewed_today === 1 ? "card" : "cards"}
              />
              <MetricCard
                label="Card sets"
                value={study.sets.length}
                detail={`${String(study.sets.reduce((n, s) => n + s.cards, 0))} cards in all`}
              />
              <MetricCard label="Notes" value={study.notes.length} detail="Pinned notes first" />
            </MetricGrid>

            {courses.length === 0 ? (
              <EmptyState
                icon="school"
                title="Add a course to get started"
                body="Card sets and notes belong to a course. Add one by hand, or upload a syllabus and StudyPulse builds it for you."
                action={{
                  label: "Add a course",
                  onPress: () => {
                    setDialog("course");
                  },
                }}
              />
            ) : (
              <>
                {courses.length > 1 ? (
                  <ChoiceChips
                    label="Show"
                    value={selected}
                    onChange={setFilter}
                    options={[
                      { value: "", label: "All courses" },
                      ...courses.map((c) => ({ value: c.id, label: c.code ?? c.name })),
                    ]}
                  />
                ) : null}

                <SectionHeading>Card sets</SectionHeading>
                {sets.length === 0 ? (
                  <EmptyState
                    icon="style"
                    title="No card sets yet"
                    body="Type cards in, paste them from Quizlet or a spreadsheet, or turn a note into cards."
                    action={{
                      label: "Make your first set",
                      onPress: () => {
                        open("set");
                      },
                    }}
                  />
                ) : (
                  <View
                    style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.related }}
                  >
                    {sets.map((s) => {
                      const c = course(s.course_id);
                      return card(
                        s.id,
                        c?.color,
                        `${s.title}, ${c?.code ?? c?.name ?? ""}, ${setSummary(s)}`,
                        <>
                          <Text style={[theme.type.cardTitle, { color: theme.colors.onSurface }]}>
                            {s.title}
                          </Text>
                          <Text style={[theme.type.body, { color: theme.colors.onSurfaceVariant }]}>
                            {[c?.code ?? c?.name, setSummary(s)].filter(Boolean).join(" · ")}
                          </Text>
                          {s.due > 0 ? (
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                              <Icon name="play-arrow" size={16} color={theme.colors.primary} />
                              <Text
                                style={[theme.type.labelLarge, { color: theme.colors.primary }]}
                              >
                                {s.due} due now
                              </Text>
                            </View>
                          ) : null}
                        </>,
                        () => {
                          router.push(`/study/sets/${s.id}`);
                        },
                        [
                          {
                            label: "Delete set",
                            destructive: true,
                            onSelect: () => {
                              undo.remove(
                                { id: s.id, label: `Deleted “${s.title}” and its cards.` },
                                () => getApi().sets.remove(s.id),
                              );
                            },
                          },
                        ],
                        `More actions for ${s.title}`,
                      );
                    })}
                  </View>
                )}

                <SectionHeading>Notes</SectionHeading>
                {notes.length === 0 ? (
                  <EmptyState
                    icon="edit-note"
                    title="No notes yet"
                    body="Take notes in class, then turn the key terms into flashcards."
                    action={{
                      label: "Write a note",
                      onPress: () => {
                        open("note");
                      },
                    }}
                  />
                ) : (
                  <View
                    style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.related }}
                  >
                    {notes.map((n) => {
                      const c = course(n.course_id);
                      const title = noteTitle(n);
                      return card(
                        n.id,
                        c?.color,
                        `${title}, ${c?.code ?? c?.name ?? ""}${n.pinned ? ", pinned" : ""}`,
                        <>
                          <Text style={[theme.type.cardTitle, { color: theme.colors.onSurface }]}>
                            {title}
                          </Text>
                          {n.excerpt ? (
                            <Text
                              numberOfLines={2}
                              style={[theme.type.body, { color: theme.colors.onSurfaceVariant }]}
                            >
                              {plainExcerpt(n.excerpt)}
                            </Text>
                          ) : null}
                          <Text
                            style={[theme.type.label, { color: theme.colors.onSurfaceVariant }]}
                          >
                            {[
                              c?.code ?? c?.name,
                              `Edited ${when.format(new Date(n.updated_at))}`,
                              n.pinned ? "Pinned" : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </Text>
                        </>,
                        () => {
                          router.push(`/study/notes/${n.id}`);
                        },
                        [
                          {
                            label: "Delete note",
                            destructive: true,
                            onSelect: () => {
                              undo.remove({ id: n.id, label: `Deleted “${title}”.` }, () =>
                                getApi().notes.remove(n.id),
                              );
                            },
                          },
                        ],
                        `More actions for ${title}`,
                      );
                    })}
                  </View>
                )}
              </>
            )}
          </>
        ) : null}
      </TabScreen>
      {undo.bar}
      <NewSetSheet
        visible={dialog === "set"}
        courses={courses}
        defaultCourseId={selected || undefined}
        onClose={() => {
          setDialog(null);
        }}
        onCreated={(set) => {
          setDialog(null);
          router.push(`/study/sets/${set.id}`);
        }}
      />
      <NewNoteSheet
        visible={dialog === "note"}
        courses={courses}
        defaultCourseId={selected || undefined}
        onClose={() => {
          setDialog(null);
        }}
        onCreated={(note) => {
          setDialog(null);
          router.push(`/study/notes/${note.id}`);
        }}
      />
      <AddCourseSheet
        visible={dialog === "course"}
        usedColors={courses.map((c) => c.color)}
        onClose={() => {
          setDialog(null);
        }}
        onCreated={() => {
          setDialog(null);
          void reload();
        }}
      />
    </View>
  );
}
