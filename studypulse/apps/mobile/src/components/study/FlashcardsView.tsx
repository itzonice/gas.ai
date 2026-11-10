// Flashcards: flip through a deck and rate each card (Again, Hard, Good, Easy), which
// schedules when it comes back. The card is one button; its label says which side is
// showing, and a spoken announcement follows every flip and every move. There are no
// gestures to learn: Previous and Skip are buttons.
import type { StudyCardRow } from "@studypulse/core/api";
import {
  describeGap,
  positionLabel,
  REVIEW_RATINGS,
  reviewFeedback,
  shuffle,
  type ReviewRating,
} from "@studypulse/core/study";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { announce } from "../../lib/hooks";
import { useAppTheme } from "../../theme";
import { Button, Notice } from "../ui";
import { CheckRow, Panel, ProgressBar } from "./controls";
import { useCardReviews } from "./useCardReviews";

const LABELS: Record<ReviewRating, string> = {
  again: "Again",
  hard: "Hard",
  good: "Good",
  easy: "Easy",
};

export function FlashcardsView({
  title,
  cards,
  onDone,
}: {
  title: string;
  cards: readonly StudyCardRow[];
  /** "Back to the set" / "Back to Study". */
  onDone: () => void;
}) {
  const theme = useAppTheme();
  const [shuffled, setShuffled] = useState(false);
  const [starredOnly, setStarredOnly] = useState(false);
  const [definitionFirst, setDefinitionFirst] = useState(false);
  const [started, setStarted] = useState(false);
  const [round, setRound] = useState(0);
  const hasStarred = cards.some((c) => c.starred);

  const deck = useMemo(() => {
    const base = starredOnly ? cards.filter((c) => c.starred) : [...cards];
    return shuffled ? shuffle(base) : base;
    // `round` re-deals a shuffled deck when the student studies again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, starredOnly, shuffled, round]);

  if (!started) {
    return (
      <View style={{ gap: theme.spacing.card }}>
        <Text style={[theme.type.bodyLarge, { color: theme.colors.onSurfaceVariant }]}>
          {cards.length} {cards.length === 1 ? "card" : "cards"}. Turn each card over, then say how
          well you knew it.
        </Text>
        <Panel>
          <CheckRow label="Shuffle the cards" checked={shuffled} onChange={setShuffled} />
          <CheckRow
            label="Show the definition first"
            checked={definitionFirst}
            onChange={setDefinitionFirst}
          />
          {hasStarred ? (
            <CheckRow
              label={`Starred cards only (${String(cards.filter((c) => c.starred).length)})`}
              checked={starredOnly}
              onChange={setStarredOnly}
            />
          ) : null}
        </Panel>
        <Button
          label="Start"
          onPress={() => {
            setStarted(true);
          }}
        />
      </View>
    );
  }

  return (
    <Deck
      key={round}
      title={title}
      deck={deck}
      definitionFirst={definitionFirst}
      onDone={onDone}
      onAgain={() => {
        setRound((r) => r + 1);
      }}
    />
  );
}

function Deck({
  title,
  deck,
  definitionFirst,
  onDone,
  onAgain,
}: {
  title: string;
  deck: readonly StudyCardRow[];
  definitionFirst: boolean;
  onDone: () => void;
  onAgain: () => void;
}) {
  const theme = useAppTheme();
  const { preview, record } = useCardReviews();
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");
  const [tally, setTally] = useState<Record<ReviewRating, number>>({
    again: 0,
    hard: 0,
    good: 0,
    easy: 0,
  });
  const [now, setNow] = useState(() => new Date());

  const card = deck[index];
  const first = definitionFirst ? "Definition" : "Term";
  const second = definitionFirst ? "Term" : "Definition";
  const termSide = (c: StudyCardRow) => (definitionFirst ? c.back : c.front);
  const defSide = (c: StudyCardRow) => (definitionFirst ? c.front : c.back);

  function go(to: number) {
    const next = deck[to];
    if (!next) return;
    setIndex(to);
    setFlipped(false);
    setNow(new Date());
    setNote("");
    announce(`${positionLabel(to, deck.length)}. ${first}: ${termSide(next)}`);
  }

  function flip() {
    if (!card) return;
    const next = !flipped;
    setFlipped(next);
    setNow(new Date());
    announce(next ? `${second}: ${defSide(card)}` : `${first}: ${termSide(card)}`);
  }

  async function rate(rating: ReviewRating) {
    if (!card || saving) return;
    setSaving(true);
    const update = preview(card, rating, new Date());
    const ok = await record(card, rating);
    setSaving(false);
    setTally((t) => ({ ...t, [rating]: t[rating] + 1 }));
    if (index + 1 >= deck.length) {
      setIndex(index + 1);
      announce("Finished. Nice work.");
    } else {
      go(index + 1);
    }
    setNote(ok ? reviewFeedback(rating, update) : "Couldn't save this review.");
  }

  if (!card) {
    const total = tally.again + tally.hard + tally.good + tally.easy;
    return (
      <Panel>
        <Text
          accessibilityRole="header"
          style={[theme.type.pageTitle, { color: theme.colors.onSurface }]}
        >
          Deck complete
        </Text>
        <Text style={[theme.type.bodyLarge, { color: theme.colors.onSurface }]}>
          You reviewed {total} {total === 1 ? "card" : "cards"}.
        </Text>
        {REVIEW_RATINGS.map((r) => (
          <Text key={r} style={[theme.type.body, { color: theme.colors.onSurfaceVariant }]}>
            {LABELS[r]}: {tally[r]}
          </Text>
        ))}
        {note ? (
          <Notice tone={note.startsWith("Couldn't") ? "error" : "info"}>{note}</Notice>
        ) : null}
        <Button label="Study again" onPress={onAgain} />
        <Button label="Done" variant="tonal" onPress={onDone} />
      </Panel>
    );
  }

  const shown = flipped ? defSide(card) : termSide(card);
  const hint = flipped
    ? `Double tap to show the ${first.toLowerCase()}`
    : `Double tap to show the ${second.toLowerCase()}`;
  return (
    <View style={{ gap: theme.spacing.card }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", flexWrap: "wrap" }}>
        <Text style={[theme.type.cardTitle, { color: theme.colors.onSurface, flexShrink: 1 }]}>
          {title}
        </Text>
        <Text style={[theme.type.body, { color: theme.colors.onSurfaceVariant }]}>
          {positionLabel(index, deck.length)}
        </Text>
      </View>
      <ProgressBar label="Progress through the deck" value={index} max={deck.length} />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${flipped ? second : first}: ${shown}`}
        accessibilityHint={hint}
        onPress={flip}
        style={({ pressed }) => ({
          minHeight: 240,
          alignItems: "center",
          justifyContent: "center",
          gap: theme.spacing.related,
          padding: theme.spacing.section,
          borderRadius: theme.radii.sheet,
          backgroundColor: flipped ? theme.colors.primaryContainer : theme.colors.surfaceContainer,
          borderWidth: flipped ? 0 : 2,
          borderColor: theme.colors.outlineVariant,
          opacity: pressed ? 0.9 : 1,
        })}
      >
        <Text
          style={[
            theme.type.labelLarge,
            {
              color: flipped ? theme.colors.onPrimaryContainer : theme.colors.onSurfaceVariant,
              textTransform: "uppercase",
              letterSpacing: 0.6,
            },
          ]}
        >
          {flipped ? second : first}
        </Text>
        <Text
          style={[
            theme.type.sectionHeading,
            {
              color: flipped ? theme.colors.onPrimaryContainer : theme.colors.onSurface,
              textAlign: "center",
            },
          ]}
        >
          {shown}
        </Text>
        <Text
          style={[
            theme.type.body,
            {
              color: flipped ? theme.colors.onPrimaryContainer : theme.colors.onSurfaceVariant,
            },
          ]}
        >
          {flipped
            ? `Tap to show the ${first.toLowerCase()}`
            : `Tap to show the ${second.toLowerCase()}`}
        </Text>
      </Pressable>

      {flipped ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.layout.targetGap }}>
          {REVIEW_RATINGS.map((r) => (
            <Pressable
              key={r}
              accessibilityRole="button"
              accessibilityLabel={`${LABELS[r]}. Back ${describeGap(preview(card, r, now))}`}
              disabled={saving}
              onPress={() => void rate(r)}
              style={({ pressed }) => ({
                flexBasis: "47%",
                flexGrow: 1,
                minHeight: theme.layout.minTarget,
                alignItems: "center",
                justifyContent: "center",
                gap: 2,
                paddingVertical: theme.spacing.related,
                borderRadius: theme.radii.control,
                borderWidth: 1,
                borderColor: theme.colors.outline,
                backgroundColor: pressed ? theme.colors.secondaryContainer : theme.colors.surface,
                opacity: saving ? 0.5 : 1,
              })}
            >
              <Text style={[theme.type.labelLarge, { color: theme.colors.onSurface }]}>
                {LABELS[r]}
              </Text>
              <Text style={[theme.type.label, { color: theme.colors.onSurfaceVariant }]}>
                Back {describeGap(preview(card, r, now))}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <Text
          style={[theme.type.body, { color: theme.colors.onSurfaceVariant, textAlign: "center" }]}
        >
          Turn the card over, then rate how well you knew it.
        </Text>
      )}

      <View style={{ flexDirection: "row", justifyContent: "center", gap: theme.layout.targetGap }}>
        <Button
          label="Previous"
          variant="text"
          disabled={index === 0}
          onPress={() => {
            go(index - 1);
          }}
        />
        <Button
          label="Skip"
          variant="text"
          disabled={index + 1 >= deck.length}
          onPress={() => {
            go(index + 1);
          }}
        />
      </View>
      {note ? <Notice tone={note.startsWith("Couldn't") ? "error" : "info"}>{note}</Notice> : null}
    </View>
  );
}
