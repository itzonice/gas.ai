"use client";

// Flashcards: flip through a deck and rate each card (Again, Hard, Good, Easy), which
// schedules when it comes back. Built for keyboards and screen readers:
// - the card is one button: Space or Enter turns it over, and a polite live region says
//   which side is showing (focus stays put);
// - while focus is inside the session, the arrow keys move between cards and 1 to 4 rate
//   (so the keys are never active elsewhere on the page; WCAG 2.1.4);
// - the turn-over animation is dropped when the system asks for less motion.
import type { StudyCardRow } from "@studypulse/core/api";
import {
  describeGap,
  positionLabel,
  REVIEW_RATINGS,
  reviewFeedback,
  shuffle,
  type ReviewRating,
} from "@studypulse/core/study";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { Button, Icon } from "@/components/ui";

import styles from "./study.module.css";
import { useReviewRecorder } from "./useReviewRecorder";

const RATING_LABELS: Record<ReviewRating, string> = {
  again: "Again",
  hard: "Hard",
  good: "Good",
  easy: "Easy",
};

export function FlashcardsSession({
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
  const [shuffled, setShuffled] = useState(false);
  const [starredOnly, setStarredOnly] = useState(false);
  const [definitionFirst, setDefinitionFirst] = useState(false);
  const [run, setRun] = useState(0);
  const [started, setStarted] = useState(false);

  const hasStarred = cards.some((c) => c.starred);
  const deck = useMemo(() => {
    const base = starredOnly ? cards.filter((c) => c.starred) : [...cards];
    return shuffled ? shuffle(base) : base;
    // `run` re-deals a shuffled deck when the student studies again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, starredOnly, shuffled, run]);

  if (cards.length === 0) {
    return (
      <div className={styles.session}>
        <Link href={backHref} className={styles.back}>
          <Icon name="arrowBack" size={20} />
          {backLabel}
        </Link>
        <h1 className="sp-visually-hidden">{title}</h1>
        <p className={styles.note}>There are no cards to study here yet.</p>
      </div>
    );
  }

  if (!started) {
    return (
      <div className={styles.session}>
        <Link href={backHref} className={styles.back}>
          <Icon name="arrowBack" size={20} />
          {backLabel}
        </Link>
        <header>
          <h1 style={{ fontSize: "var(--sp-type-page-title-size)" }}>{title}</h1>
          <p className={styles.note}>
            {cards.length} {cards.length === 1 ? "card" : "cards"}. Turn each card over, then say
            how well you knew it.
          </p>
        </header>
        <fieldset className={styles.question}>
          <legend className="sp-visually-hidden">Options</legend>
          <label className={styles.checkRow}>
            <input
              type="checkbox"
              checked={shuffled}
              onChange={(e) => {
                setShuffled(e.currentTarget.checked);
              }}
            />
            Shuffle the cards
          </label>
          <label className={styles.checkRow}>
            <input
              type="checkbox"
              checked={definitionFirst}
              onChange={(e) => {
                setDefinitionFirst(e.currentTarget.checked);
              }}
            />
            Show the definition first
          </label>
          {hasStarred ? (
            <label className={styles.checkRow}>
              <input
                type="checkbox"
                checked={starredOnly}
                onChange={(e) => {
                  setStarredOnly(e.currentTarget.checked);
                }}
              />
              Starred cards only ({cards.filter((c) => c.starred).length})
            </label>
          ) : null}
        </fieldset>
        <div className={styles.controls}>
          <Button
            variant="filled"
            icon="play"
            onClick={() => {
              setStarted(true);
            }}
          >
            Start
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Deck
      key={run}
      title={title}
      deck={deck}
      definitionFirst={definitionFirst}
      backHref={backHref}
      backLabel={backLabel}
      onRestart={() => {
        setRun((r) => r + 1);
      }}
    />
  );
}

function Deck({
  title,
  deck,
  definitionFirst,
  backHref,
  backLabel,
  onRestart,
}: {
  title: string;
  deck: readonly StudyCardRow[];
  definitionFirst: boolean;
  backHref: string;
  backLabel: string;
  onRestart: () => void;
}) {
  const { record, preview } = useReviewRecorder();
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [flips, setFlips] = useState(0);
  const [saving, setSaving] = useState(false);
  const [tally, setTally] = useState<Record<ReviewRating, number>>({
    again: 0,
    hard: 0,
    good: 0,
    easy: 0,
  });
  const [announcement, setAnnouncement] = useState("");
  const [note, setNote] = useState("");
  const stage = useRef<HTMLButtonElement>(null);
  const [now, setNow] = useState(() => new Date());

  const finished = index >= deck.length;
  const card = deck[index];
  const termSide = (c: StudyCardRow) => (definitionFirst ? c.back : c.front);
  const defSide = (c: StudyCardRow) => (definitionFirst ? c.front : c.back);
  const firstLabel = definitionFirst ? "Definition" : "Term";
  const secondLabel = definitionFirst ? "Term" : "Definition";

  useEffect(() => {
    if (!finished) stage.current?.focus({ preventScroll: true });
  }, [finished, index]);

  function say(text: string) {
    setAnnouncement(text);
  }

  function go(to: number) {
    if (to < 0 || to >= deck.length) return;
    const next = deck[to];
    setIndex(to);
    setFlipped(false);
    setNow(new Date());
    setNote("");
    if (next) say(`${positionLabel(to, deck.length)}. ${firstLabel}: ${termSide(next)}`);
  }

  function flip() {
    if (!card) return;
    const next = !flipped;
    setFlipped(next);
    setFlips((n) => n + 1);
    setNow(new Date());
    say(next ? `${secondLabel}: ${defSide(card)}` : `${firstLabel}: ${termSide(card)}`);
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
      say("Finished. Nice work.");
    } else {
      go(index + 1);
    }
    // After moving on, because moving on clears the previous card's note.
    setNote(
      ok ? reviewFeedback(rating, update) : "Couldn't save this review. Check your connection.",
    );
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    const target = event.target as HTMLElement;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
    if (finished) return;
    if (event.key === "ArrowRight") {
      event.preventDefault();
      go(index + 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      go(index - 1);
    } else if (flipped && ["1", "2", "3", "4"].includes(event.key)) {
      event.preventDefault();
      const rating = REVIEW_RATINGS[Number(event.key) - 1];
      if (rating) void rate(rating);
    }
  }

  if (finished) {
    const total = tally.again + tally.hard + tally.good + tally.easy;
    return (
      <div className={styles.session}>
        <Link href={backHref} className={styles.back}>
          <Icon name="arrowBack" size={20} />
          {backLabel}
        </Link>
        <section className={styles.summary} aria-labelledby="fc-done">
          <h1 id="fc-done" className={styles.bigNumber}>
            Deck complete
          </h1>
          <p style={{ margin: 0 }}>
            You reviewed {total} {total === 1 ? "card" : "cards"}.
          </p>
          <ul className={styles.resultList} aria-label="Your ratings">
            {REVIEW_RATINGS.map((r) => (
              <li key={r}>
                {RATING_LABELS[r]}: {tally[r]}
              </li>
            ))}
          </ul>
          {note ? <p className={styles.note}>{note}</p> : null}
          <div className={styles.controls}>
            <Button variant="filled" icon="flip" onClick={onRestart}>
              Study again
            </Button>
            <Button variant="tonal" href={backHref}>
              {backLabel}
            </Button>
          </div>
        </section>
        <p role="status" className="sp-visually-hidden">
          {announcement}
        </p>
      </div>
    );
  }

  const shown = flipped ? defSide(card as StudyCardRow) : termSide(card as StudyCardRow);
  return (
    // The keys work only while focus is inside this section (WCAG 2.1.4).
    <section className={styles.session} aria-label={`${title}, flashcards`} onKeyDown={onKeyDown}>
      <Link href={backHref} className={styles.back}>
        <Icon name="arrowBack" size={20} />
        {backLabel}
      </Link>
      <div className={styles.sessionHeader}>
        <h1 style={{ fontSize: "var(--sp-type-section-heading-size)" }}>{title}</h1>
        <span className={styles.progressText}>{positionLabel(index, deck.length)}</span>
      </div>
      <div
        className={styles.meter}
        role="progressbar"
        aria-label="Progress through the deck"
        aria-valuemin={0}
        aria-valuemax={deck.length}
        aria-valuenow={index}
      >
        <div
          className={styles.meterFill}
          style={{ width: `${String((index / deck.length) * 100)}%` }}
        />
      </div>

      <button
        ref={stage}
        type="button"
        className={`${styles.stage} ${flipped ? styles.stageBack : ""}`}
        onClick={flip}
        aria-label={`${flipped ? secondLabel : firstLabel}: ${shown}. ${flipped ? `Press to show the ${firstLabel.toLowerCase()}` : `Press to show the ${secondLabel.toLowerCase()}`}`}
      >
        {/* Re-keyed on each flip so the turn-over animation replays; the button itself stays
            mounted, so keyboard focus is never lost. */}
        <span
          key={`${String(index)}-${String(flips)}`}
          className={`${styles.faceWrap} ${flips > 0 ? styles.stageFlip : ""}`}
          aria-hidden="true"
        >
          <span className={styles.faceLabel}>{flipped ? secondLabel : firstLabel}</span>
          <span className={styles.faceText}>{shown}</span>
          <span className={styles.faceHint}>
            {flipped
              ? `Press to show the ${firstLabel.toLowerCase()}`
              : `Press to show the ${secondLabel.toLowerCase()}`}
          </span>
        </span>
      </button>

      {flipped ? (
        <div role="group" aria-label="How well did you know it?" className={styles.ratings}>
          {REVIEW_RATINGS.map((r, i) => (
            <button
              key={r}
              type="button"
              className={styles.rating}
              disabled={saving}
              onClick={() => void rate(r)}
            >
              <span className={styles.ratingLabel}>
                {RATING_LABELS[r]} <span aria-hidden="true">({i + 1})</span>
              </span>
              <span className={styles.ratingGap}>
                Back {describeGap(preview(card as StudyCardRow, r, now))}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className={styles.keys}>Turn the card over, then rate how well you knew it.</p>
      )}

      <div className={styles.controls}>
        <Button
          variant="text"
          icon="arrowBack"
          disabled={index === 0}
          onClick={() => {
            go(index - 1);
          }}
        >
          Previous
        </Button>
        <Button
          variant="text"
          disabled={index + 1 >= deck.length}
          onClick={() => {
            go(index + 1);
          }}
        >
          Skip
          <Icon name="arrowForward" size={20} />
        </Button>
      </div>
      <p className={styles.keys}>
        Keys while a control here has focus: Space turns the card, arrow keys move, 1 to 4 rate.
      </p>
      {note ? <p className={styles.flash}>{note}</p> : null}
      <p role="status" className="sp-visually-hidden">
        {announcement}
      </p>
    </section>
  );
}
