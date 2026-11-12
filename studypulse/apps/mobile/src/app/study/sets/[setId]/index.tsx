// A card set: its four study modes, its cards (add, edit, star, delete with Undo, paste to
// import), and progress in words. Opens offline from the saved copy, so a student can
// study on a plane; edits need a connection.
import { ApiError, setDetailSchema, type SetDetail, type StudyCardRow } from "@studypulse/core/api";
import {
  cardCountLabel,
  isDue,
  masteryOf,
  MASTERY_LABELS,
  STUDY_MODES,
} from "@studypulse/core/study";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";

import {
  AddCardSheet,
  EditCardSheet,
  EditSetSheet,
  ImportSheet,
} from "../../../../components/study/SetSheets";
import { ConfirmSheet } from "../../../../components/study/StudySheets";
import { SectionHeading, TabScreen } from "../../../../components/TabScreen";
import {
  CourseChip,
  EmptyState,
  Icon,
  MetricCard,
  MetricGrid,
  OverflowMenu,
  useUndoDelete,
} from "../../../../components/ui";
import { errorMessage } from "../../../../lib/errors";
import { announce, useLoad } from "../../../../lib/hooks";
import { cached } from "../../../../lib/offline";
import { getApi } from "../../../../lib/supabase";
import { useAppTheme } from "../../../../theme";

type Dialog = "add" | "import" | "edit-set" | "reset" | "delete-set" | null;

export default function SetScreen() {
  const theme = useAppTheme();
  const { setId } = useLocalSearchParams<{ setId: string }>();
  const fetcher = useCallback(
    async () => ({
      detail: await cached(`set.${setId}`, setDetailSchema, () => getApi().sets.get(setId)),
      now: new Date(),
    }),
    [setId],
  );
  const { data, error, failure, refreshing, refresh, reload } = useLoad(fetcher);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [editing, setEditing] = useState<StudyCardRow | null>(null);
  const [starred, setStarred] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  function say(text: string, isError = false) {
    setMessage({ text, error: isError });
    announce(text);
  }
  const undo = useUndoDelete({
    onError: () => {
      say("Couldn't delete that card. It's back in the set.", true);
    },
    onCommitted: () => void reload(),
  });

  const detail: SetDetail | undefined = data?.detail;
  const cards = useMemo(
    () => (detail?.cards ?? []).filter((c) => !undo.hidden.has(c.id)),
    [detail, undo.hidden],
  );
  const loadedAt = data?.now;
  const now = useMemo(() => loadedAt ?? new Date(), [loadedAt]);
  const notFound = failure instanceof ApiError && failure.status === 404;
  const counts = useMemo(() => {
    const m = { new: 0, learning: 0, known: 0 };
    for (const c of cards) m[masteryOf(c)]++;
    return { due: cards.filter((c) => isDue(c, now)).length, ...m };
  }, [cards, now]);

  async function toggleStar(card: StudyCardRow) {
    const next = !(starred[card.id] ?? card.starred);
    setStarred((s) => ({ ...s, [card.id]: next }));
    try {
      await getApi().cards.update({ id: card.id, starred: next });
      say(next ? "Card starred." : "Star removed.");
    } catch {
      setStarred((s) => ({ ...s, [card.id]: !next }));
      say("Couldn't change the star. Try again.", true);
    }
  }

  async function resetProgress() {
    setDialog(null);
    try {
      await getApi().sets.resetProgress(setId);
      say("Progress reset. Every card is new again.");
      void reload();
    } catch (e) {
      say(errorMessage(e, "Couldn't reset progress."), true);
    }
  }

  async function deleteSet() {
    setDialog(null);
    try {
      await getApi().sets.remove(setId);
      router.replace("/study");
    } catch (e) {
      say(errorMessage(e, "Couldn't delete the set."), true);
    }
  }

  const header = (
    <Stack.Screen options={{ headerShown: true, title: detail?.set.title ?? "Card set" }} />
  );
  if (!detail) {
    return (
      <>
        {header}
        <TabScreen
          title="Card set"
          loading={!error}
          error={notFound ? "This set isn't here. It may have been deleted." : error}
          refreshing={refreshing}
          onRefresh={() => void refresh()}
          settings={false}
          topInset={false}
        />
      </>
    );
  }

  const hasCards = cards.length > 0;
  const ModeIcon = {
    flashcards: "flip",
    learn: "school",
    test: "fact-check",
    match: "swap-horiz",
  } as const;
  return (
    <View style={{ flex: 1 }}>
      {header}
      <TabScreen
        title={detail.set.title}
        description={
          <>
            {detail.course.code ?? detail.course.name}
            {detail.set.description ? ` · ${detail.set.description}` : ""}
          </>
        }
        primaryAction={
          hasCards
            ? {
                label: "Study flashcards",
                onPress: () => {
                  router.push(`/study/sets/${setId}/flashcards`);
                },
              }
            : {
                label: "Add cards",
                onPress: () => {
                  setDialog("add");
                },
              }
        }
        secondaryActions={[
          ...(hasCards
            ? [
                {
                  label: "Add cards",
                  onSelect: () => {
                    setDialog("add");
                  },
                },
              ]
            : []),
          {
            label: "Import cards",
            onSelect: () => {
              setDialog("import");
            },
          },
          {
            label: "Edit set",
            onSelect: () => {
              setDialog("edit-set");
            },
          },
          ...(hasCards
            ? [
                {
                  label: "Reset progress",
                  onSelect: () => {
                    setDialog("reset");
                  },
                },
              ]
            : []),
          {
            label: "Delete set",
            destructive: true,
            onSelect: () => {
              setDialog("delete-set");
            },
          },
        ]}
        error={error ?? (message?.error ? message.text : null)}
        refreshing={refreshing}
        onRefresh={() => void refresh()}
        settings={false}
        topInset={false}
      >
        <CourseChip
          code={detail.course.code ?? detail.course.name}
          colorHex={detail.course.color}
        />
        {message && !message.error ? (
          <Text
            accessibilityLiveRegion="polite"
            style={[theme.type.body, { color: theme.colors.onSurfaceVariant }]}
          >
            {message.text}
          </Text>
        ) : null}
        <MetricGrid>
          <MetricCard label="Cards" value={cards.length} detail={cardCountLabel(cards.length)} />
          <MetricCard
            label="Due now"
            value={counts.due}
            detail={counts.due === 0 ? "Nothing due" : "Ready to review"}
          />
          <MetricCard
            label="Still learning"
            value={counts.learning}
            detail="Seen, gap under a week"
          />
          <MetricCard label="Known" value={counts.known} detail={`${String(counts.new)} new`} />
        </MetricGrid>

        <SectionHeading>Study this set</SectionHeading>
        <View style={{ gap: theme.spacing.related }}>
          {STUDY_MODES.map((m) => {
            const ok = cards.length >= m.minCards;
            return (
              <Pressable
                key={m.id}
                accessibilityRole="button"
                accessibilityLabel={`${m.label}. ${ok ? m.description : `Add at least ${String(m.minCards)} cards to use this.`}`}
                accessibilityState={{ disabled: !ok }}
                disabled={!ok}
                onPress={() => {
                  router.push(`/study/sets/${setId}/${m.id}`);
                }}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  gap: theme.spacing.card,
                  minHeight: theme.layout.minTarget,
                  padding: theme.spacing.card,
                  borderRadius: theme.radii.card,
                  backgroundColor: theme.colors.surfaceContainer,
                  opacity: !ok ? 0.55 : pressed ? 0.8 : 1,
                })}
              >
                <Icon name={ModeIcon[m.id]} size={24} color={theme.colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={[theme.type.cardTitle, { color: theme.colors.onSurface }]}>
                    {m.label}
                  </Text>
                  <Text style={[theme.type.body, { color: theme.colors.onSurfaceVariant }]}>
                    {ok ? m.description : `Add at least ${String(m.minCards)} cards to use this.`}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <SectionHeading>{`Cards (${String(cards.length)})`}</SectionHeading>
        {cards.length === 0 ? (
          <EmptyState
            icon="style"
            title="No cards yet"
            body="Type a card, paste a list from Quizlet or a spreadsheet, or make cards from a note."
            action={{
              label: "Add a card",
              onPress: () => {
                setDialog("add");
              },
            }}
          />
        ) : (
          <View style={{ borderRadius: theme.radii.card, overflow: "hidden" }}>
            {cards.map((c, i) => {
              const isStarred = starred[c.id] ?? c.starred;
              return (
                <View
                  key={c.id}
                  style={{
                    flexDirection: "row",
                    alignItems: "flex-start",
                    gap: theme.spacing.half,
                    paddingVertical: theme.spacing.related,
                    paddingLeft: theme.spacing.card,
                    backgroundColor: theme.colors.surfaceContainerLow,
                    borderTopWidth: i === 0 ? 0 : 1,
                    borderTopColor: theme.colors.outlineVariant,
                  }}
                >
                  <View
                    accessible
                    style={{ flex: 1, gap: 2, paddingVertical: 12 }}
                    accessibilityLabel={`${c.front}. ${c.back}. ${MASTERY_LABELS[masteryOf(c)]}${isDue(c, now) ? ", due" : ""}`}
                  >
                    <Text style={[theme.type.cardTitle, { color: theme.colors.onSurface }]}>
                      {c.front}
                    </Text>
                    <Text style={[theme.type.body, { color: theme.colors.onSurface }]}>
                      {c.back}
                    </Text>
                    <Text style={[theme.type.label, { color: theme.colors.onSurfaceVariant }]}>
                      {MASTERY_LABELS[masteryOf(c)]}
                      {isDue(c, now) ? " · Due" : ""}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Star ${c.front}`}
                    accessibilityState={{ selected: isStarred }}
                    onPress={() => void toggleStar(c)}
                    style={{
                      width: 48,
                      height: 48,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon
                      name={isStarred ? "star" : "star-border"}
                      size={24}
                      color={isStarred ? theme.colors.primary : theme.colors.onSurfaceVariant}
                    />
                  </Pressable>
                  <OverflowMenu
                    label={`More actions for ${c.front}`}
                    items={[
                      {
                        label: "Edit card",
                        onSelect: () => {
                          setEditing(c);
                        },
                      },
                      {
                        label: "Delete card",
                        destructive: true,
                        onSelect: () => {
                          undo.remove({ id: c.id, label: "Deleted the card." }, () =>
                            getApi().cards.remove(c.id),
                          );
                        },
                      },
                    ]}
                  />
                </View>
              );
            })}
          </View>
        )}
      </TabScreen>
      {undo.bar}

      <AddCardSheet
        visible={dialog === "add"}
        setId={setId}
        courseId={detail.set.course_id}
        cardCount={detail.cards.length}
        onClose={() => {
          setDialog(null);
        }}
        onAdded={() => {
          void reload();
        }}
      />
      <ImportSheet
        visible={dialog === "import"}
        setId={setId}
        courseId={detail.set.course_id}
        cardCount={detail.cards.length}
        onClose={() => {
          setDialog(null);
        }}
        onImported={(n) => {
          setDialog(null);
          say(`Imported ${String(n)} ${n === 1 ? "card" : "cards"}.`);
          void reload();
        }}
      />
      <EditSetSheet
        visible={dialog === "edit-set"}
        set={detail.set}
        onClose={() => {
          setDialog(null);
        }}
        onSaved={() => {
          setDialog(null);
          say("Set saved.");
          void reload();
        }}
      />
      <EditCardSheet
        card={editing}
        onClose={() => {
          setEditing(null);
        }}
        onSaved={() => {
          setEditing(null);
          say("Card saved.");
          void reload();
        }}
      />
      <ConfirmSheet
        visible={dialog === "reset"}
        title="Reset progress?"
        message="Every card in this set becomes new again and loses its review schedule. The cards themselves stay."
        confirmLabel="Reset progress"
        danger
        onClose={() => {
          setDialog(null);
        }}
        onConfirm={() => void resetProgress()}
      />
      <ConfirmSheet
        visible={dialog === "delete-set"}
        title="Delete this set?"
        message={`This deletes “${detail.set.title}” and its ${cardCountLabel(detail.cards.length)}. You can't undo this.`}
        confirmLabel="Delete set"
        danger
        onClose={() => {
          setDialog(null);
        }}
        onConfirm={() => void deleteSet()}
      />
    </View>
  );
}
