// Match: pair each term with its definition by picking two tiles. There is no dragging and
// no time limit: the clock only counts up as a score and can be hidden. Tile state is said
// in words ("selected", "matched", "not a match"), and each outcome is read out loud.
import type { StudyCardRow } from "@studypulse/core/api";
import {
  createMatch,
  formatMatchTime,
  matchDone,
  selectTile,
  tileLabel,
  type MatchState,
} from "@studypulse/core/study";
import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { announce, nowMs, useWindowClass } from "../../lib/hooks";
import { useAppTheme } from "../../theme";
import { Button, Icon } from "../ui";
import { CheckRow, Panel } from "./controls";

export function MatchView({
  title,
  cards,
  onDone,
}: {
  title: string;
  cards: readonly StudyCardRow[];
  onDone: () => void;
}) {
  const [round, setRound] = useState(0);
  return (
    <Round
      key={round}
      title={title}
      cards={cards}
      onDone={onDone}
      onAgain={() => {
        setRound((r) => r + 1);
      }}
    />
  );
}

function Round({
  title,
  cards,
  onDone,
  onAgain,
}: {
  title: string;
  cards: readonly StudyCardRow[];
  onDone: () => void;
  onAgain: () => void;
}) {
  const theme = useAppTheme();
  const size = useWindowClass();
  const [state, setState] = useState<MatchState>(() => createMatch(cards));
  const [showTimer, setShowTimer] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [finalMs, setFinalMs] = useState(0);
  const startedAt = useRef<number | null>(null);
  const done = matchDone(state);
  const pairs = state.tiles.length / 2;

  useEffect(() => {
    if (done || state.tiles.length === 0) return;
    const id = setInterval(() => {
      if (startedAt.current !== null) setElapsed(nowMs() - startedAt.current);
    }, 1000);
    return () => {
      clearInterval(id);
    };
  }, [done, state.tiles.length]);

  function pick(tileId: string) {
    const at = nowMs();
    startedAt.current ??= at;
    const result = selectTile(state, tileId);
    setState(result.state);
    const tile = state.tiles.find((t) => t.id === tileId);
    if (result.event === "selected" && tile) announce(`Selected: ${tile.text}.`);
    else if (result.event === "deselected") announce("Selection cleared.");
    else if (result.event === "mismatch") announce("Not a match. Try again.");
    else if (result.event === "match") {
      if (matchDone(result.state)) {
        const total = at - startedAt.current;
        setFinalMs(total);
        setElapsed(total);
        announce(
          `All matched in ${formatMatchTime(total)} with ${String(result.state.mistakes)} ${result.state.mistakes === 1 ? "mistake" : "mistakes"}.`,
        );
      } else {
        announce(`Matched. ${String(result.state.matched.length / 2)} of ${String(pairs)} pairs.`);
      }
    }
  }

  if (state.tiles.length === 0) {
    return (
      <Text style={[theme.type.bodyLarge, { color: theme.colors.onSurfaceVariant }]}>
        Match needs at least two cards with short, different terms and definitions.
      </Text>
    );
  }

  const basis = size === "compact" ? "47%" : "23%";
  return (
    <View style={{ gap: theme.spacing.card }}>
      <Text style={[theme.type.cardTitle, { color: theme.colors.onSurface }]}>Match: {title}</Text>
      <Text
        accessibilityLiveRegion="none"
        style={[theme.type.body, { color: theme.colors.onSurfaceVariant }]}
      >
        {state.matched.length / 2} of {pairs} pairs
        {showTimer ? ` · ${formatMatchTime(elapsed)}` : ""} · {state.mistakes}{" "}
        {state.mistakes === 1 ? "mistake" : "mistakes"}
      </Text>

      {done ? (
        <Panel>
          <Text
            accessibilityRole="header"
            style={[theme.type.pageTitle, { color: theme.colors.onSurface }]}
          >
            All matched
          </Text>
          <Text style={[theme.type.bodyLarge, { color: theme.colors.onSurface }]}>
            {formatMatchTime(finalMs)} with {state.mistakes}{" "}
            {state.mistakes === 1 ? "mistake" : "mistakes"}.
          </Text>
          <Button label="Play again" onPress={onAgain} />
          <Button label="Done" variant="tonal" onPress={onDone} />
        </Panel>
      ) : (
        <>
          <Text style={[theme.type.body, { color: theme.colors.onSurfaceVariant }]}>
            Pick a term, then pick its definition. Matched tiles stay on the board, dimmed.
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.layout.targetGap }}>
            {state.tiles.map((t) => {
              const matched = state.matched.includes(t.id);
              const selected = state.selected === t.id;
              const mismatch = state.lastMismatch?.includes(t.id) === true;
              return (
                <Pressable
                  key={t.id}
                  accessibilityRole="button"
                  accessibilityLabel={tileLabel(t, state)}
                  accessibilityState={{ selected, disabled: matched }}
                  disabled={matched}
                  onPress={() => {
                    pick(t.id);
                  }}
                  style={({ pressed }) => ({
                    flexBasis: basis,
                    flexGrow: 1,
                    minHeight: 96,
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 4,
                    padding: theme.spacing.related,
                    borderRadius: theme.radii.card,
                    borderWidth: 2,
                    borderStyle: matched ? "dashed" : "solid",
                    borderColor: mismatch
                      ? theme.colors.error
                      : selected
                        ? theme.colors.primary
                        : theme.colors.outlineVariant,
                    backgroundColor: matched
                      ? "transparent"
                      : selected
                        ? theme.colors.secondaryContainer
                        : theme.colors.surfaceContainer,
                    opacity: pressed ? 0.85 : 1,
                  })}
                >
                  <Text
                    style={[
                      theme.type.body,
                      {
                        textAlign: "center",
                        color: matched ? theme.colors.onSurfaceVariant : theme.colors.onSurface,
                      },
                    ]}
                  >
                    {t.text}
                  </Text>
                  {matched || selected || mismatch ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Icon
                        name={matched ? "check" : mismatch ? "close" : "touch-app"}
                        size={16}
                        color={mismatch ? theme.colors.error : theme.colors.onSurfaceVariant}
                      />
                      <Text style={[theme.type.label, { color: theme.colors.onSurfaceVariant }]}>
                        {matched ? "Matched" : mismatch ? "Not a match" : "Selected"}
                      </Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      <CheckRow
        label="Show the timer"
        hint="There's no time limit. The timer only counts up."
        checked={showTimer}
        onChange={setShowTimer}
      />
    </View>
  );
}
