"use client";

// Match: pair each term with its definition. You pick two tiles; there is no dragging
// (WCAG 2.5.7) and no time limit: the clock only counts up as a score and can be hidden
// (WCAG 2.2.1). Tile state is said in words ("selected", "matched", "not a match"), and
// every outcome goes to a polite live region.
import type { StudyCardRow } from "@studypulse/core/api";
import {
  createMatch,
  formatMatchTime,
  matchDone,
  selectTile,
  tileLabel,
  type MatchState,
} from "@studypulse/core/study";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Button, CheckboxField, Icon } from "@/components/ui";

import styles from "./study.module.css";

export function MatchSession({
  title,
  cards,
  backHref,
  backLabel,
}: {
  title: string;
  cards: readonly StudyCardRow[];
  backHref: string;
  backLabel: string;
}) {
  const [round, setRound] = useState(0);
  return (
    <Round
      key={round}
      title={title}
      cards={cards}
      backHref={backHref}
      backLabel={backLabel}
      onAgain={() => {
        setRound((r) => r + 1);
      }}
    />
  );
}

function Round({
  title,
  cards,
  backHref,
  backLabel,
  onAgain,
}: {
  title: string;
  cards: readonly StudyCardRow[];
  backHref: string;
  backLabel: string;
  onAgain: () => void;
}) {
  const [state, setState] = useState<MatchState>(() => createMatch(cards));
  const [announcement, setAnnouncement] = useState("");
  const [showTimer, setShowTimer] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  // Times are in milliseconds from the browser's clock (event.timeStamp and
  // performance.now() share one origin), read only in event handlers and timers.
  const startedAt = useRef<number | null>(null);
  const [finalMs, setFinalMs] = useState(0);
  const done = matchDone(state);
  const pairs = state.tiles.length / 2;
  const matchedPairs = state.matched.length / 2;

  useEffect(() => {
    if (done || state.tiles.length === 0) return;
    const id = window.setInterval(() => {
      if (startedAt.current !== null) setElapsed(performance.now() - startedAt.current);
    }, 1000);
    return () => {
      window.clearInterval(id);
    };
  }, [done, state.tiles.length]);

  function pick(tileId: string, at: number) {
    startedAt.current ??= at;
    const result = selectTile(state, tileId);
    setState(result.state);
    const tile = state.tiles.find((t) => t.id === tileId);
    if (result.event === "selected" && tile) setAnnouncement(`Selected: ${tile.text}.`);
    else if (result.event === "deselected") setAnnouncement("Selection cleared.");
    else if (result.event === "mismatch") setAnnouncement("Not a match. Try again.");
    else if (result.event === "match") {
      if (matchDone(result.state)) {
        const total = at - startedAt.current;
        setFinalMs(total);
        setElapsed(total);
        setAnnouncement(
          `All matched in ${formatMatchTime(total)} with ${String(result.state.mistakes)} ${result.state.mistakes === 1 ? "mistake" : "mistakes"}.`,
        );
      } else {
        setAnnouncement(
          `Matched. ${String(result.state.matched.length / 2)} of ${String(pairs)} pairs.`,
        );
      }
    }
  }

  const back = (
    <Link href={backHref} className={styles.back}>
      <Icon name="arrowBack" size={20} />
      {backLabel}
    </Link>
  );

  if (state.tiles.length === 0) {
    return (
      <div className={styles.session}>
        {back}
        <h1 style={{ fontSize: "var(--sp-type-page-title-size)" }}>Match: {title}</h1>
        <p className={styles.note}>
          Match needs at least two cards with short, different terms and definitions.
        </p>
      </div>
    );
  }

  return (
    <section
      className={styles.session}
      style={{ maxWidth: "960px" }}
      aria-label={`Match: ${title}`}
    >
      {back}
      <div className={styles.sessionHeader}>
        <h1 style={{ fontSize: "var(--sp-type-section-heading-size)" }}>Match: {title}</h1>
        <span className={styles.progressText}>
          {matchedPairs} of {pairs} pairs
          {showTimer ? ` · ${formatMatchTime(elapsed)}` : ""}
          {" · "}
          {state.mistakes} {state.mistakes === 1 ? "mistake" : "mistakes"}
        </span>
      </div>

      {done ? (
        <div className={styles.summary}>
          <h2 className={styles.bigNumber}>All matched</h2>
          <p style={{ margin: 0 }}>
            {formatMatchTime(finalMs)} with {state.mistakes}{" "}
            {state.mistakes === 1 ? "mistake" : "mistakes"}.
          </p>
          <div className={styles.controls}>
            <Button variant="filled" icon="flip" onClick={onAgain}>
              Play again
            </Button>
            <Button variant="tonal" href={backHref}>
              {backLabel}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className={styles.note}>
            Pick a term, then pick its definition. Matched tiles stay on the board, dimmed.
          </p>
          <ul className={styles.tiles} aria-label="Tiles">
            {state.tiles.map((t) => {
              const matched = state.matched.includes(t.id);
              const selected = state.selected === t.id;
              const mismatch = state.lastMismatch?.includes(t.id) === true;
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    className={`${styles.tile} ${selected ? styles.tileSelected : ""} ${matched ? styles.tileMatched : ""} ${mismatch ? styles.tileMismatch : ""}`}
                    aria-pressed={matched ? undefined : selected}
                    aria-disabled={matched}
                    aria-label={tileLabel(t, state)}
                    onClick={(e) => {
                      if (!matched) pick(t.id, e.timeStamp);
                    }}
                  >
                    <span aria-hidden="true">{t.text}</span>
                    {matched ? (
                      <span className={styles.tileTag} aria-hidden="true">
                        <Icon name="check" size={16} />
                        Matched
                      </span>
                    ) : selected ? (
                      <span className={styles.tileTag} aria-hidden="true">
                        Selected
                      </span>
                    ) : mismatch ? (
                      <span className={styles.tileTag} aria-hidden="true">
                        <Icon name="close" size={16} />
                        Not a match
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <CheckboxField
        label="Show the timer"
        hint="There's no time limit. The timer only counts up."
        checked={showTimer}
        onChange={(e) => {
          setShowTimer(e.currentTarget.checked);
        }}
      />
      <p role="status" className="sp-visually-hidden">
        {announcement}
      </p>
    </section>
  );
}
