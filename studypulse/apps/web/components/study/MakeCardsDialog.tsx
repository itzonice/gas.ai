"use client";

// Turns a note into flashcards, two ways:
//  - from the note's own lines ("term :: definition", or Q:/A: pairs): free and instant;
//  - with AI (up to 20 cards): sends the note to Anthropic, so it asks for consent first.
// The cards go into a new set (named after the note) or one the course already has.
import { ApiError, type StudySetSummary } from "@studypulse/core/api";
import { cardCountLabel, cardsFromNote, noteTitle } from "@studypulse/core/study";
import { useEffect, useMemo, useState } from "react";

import { useApi } from "@/components/auth/SessionProvider";
import { AiConsentDialog } from "@/components/privacy/AiConsent";
import { Button, Dialog, Icon, SelectField } from "@/components/ui";

import styles from "./study.module.css";

type Method = "lines" | "ai";
const NEW = "new";

export function MakeCardsDialog({
  open,
  note,
  onClose,
  onMade,
}: {
  open: boolean;
  note: { courseId: string; title: string; body: string };
  onClose: () => void;
  onMade: (setId: string, count: number) => void;
}) {
  const api = useApi();
  const lines = useMemo(() => cardsFromNote(note.body), [note.body]);
  const [method, setMethod] = useState<Method>("lines");
  const [sets, setSets] = useState<StudySetSummary[]>([]);
  const [destination, setDestination] = useState(NEW);
  const [ai, setAi] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);

  useEffect(() => {
    if (!open) return;
    /* eslint-disable react-hooks/set-state-in-effect -- resetting the dialog on open */
    setMethod(cardsFromNote(note.body).length > 0 ? "lines" : "ai");
    setDestination(NEW);
    setError(null);
    setBusy(false);
    /* eslint-enable react-hooks/set-state-in-effect */
    let cancelled = false;
    void api.study
      .overview()
      .then((o) => {
        if (!cancelled) setSets(o.sets.filter((s) => s.course_id === note.courseId));
      })
      .catch(() => undefined);
    void api
      .features()
      .then((f) => {
        if (!cancelled) setAi(f.ai);
      })
      .catch(() => {
        if (!cancelled) setAi(null);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when it opens
  }, [open]);

  const title = noteTitle(note);
  const aiPossible = ai !== false;
  const enoughForAi = note.body.trim().length >= 40;

  async function make() {
    setBusy(true);
    setError(null);
    try {
      if (method === "lines") {
        let setId = destination;
        let start = 0;
        if (destination === NEW) {
          setId = (await api.sets.create({ courseId: note.courseId, title: title.slice(0, 120) }))
            .id;
        } else {
          start = sets.find((s) => s.id === destination)?.cards ?? 0;
        }
        await api.cards.add({ setId, courseId: note.courseId, cards: lines, startPosition: start });
        onMade(setId, lines.length);
      } else {
        const result = await api.cards.generate({
          courseId: note.courseId,
          notes: note.body,
          ...(destination === NEW ? { setTitle: title.slice(0, 120) } : { setId: destination }),
        });
        if (result.cards.length === 0) {
          setError(result.skipped_reason ?? "No cards could be made from this note.");
          setBusy(false);
          return;
        }
        onMade(result.set_id, result.cards.length);
      }
    } catch (e) {
      setBusy(false);
      if (e instanceof ApiError && e.code === "ai_consent_required") {
        setConsent(true);
        return;
      }
      setError(
        e instanceof ApiError && e.code === "card_limit_reached"
          ? "You've used today's AI card limit. Try again tomorrow, or make cards from lines in your note."
          : e instanceof ApiError && e.code === "ai_not_configured"
            ? "Making cards with AI isn't available right now. You can still make cards from lines in your note."
            : e instanceof ApiError && e.code === "set_full"
              ? "That set is full. Choose another set."
              : e instanceof Error
                ? e.message
                : "Couldn't make the cards.",
      );
    }
  }

  const canMake = method === "lines" ? lines.length > 0 : aiPossible && enoughForAi;

  return (
    <>
      <Dialog
        open={open && !consent}
        onClose={onClose}
        title="Make flashcards from this note"
        labelledBy="make-cards-title"
        footer={
          <>
            <Button variant="text" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="filled" disabled={busy || !canMake} onClick={() => void make()}>
              {busy ? "Making cards…" : "Make cards"}
            </Button>
          </>
        }
      >
        <div className={styles.formGrid}>
          <fieldset className={styles.choices} style={{ border: 0, margin: 0, padding: 0 }}>
            <legend className={styles.questionKind} style={{ padding: 0 }}>
              How
            </legend>
            <label className={`${styles.choice} ${styles.radioChoice}`}>
              <input
                type="radio"
                name="how"
                checked={method === "lines"}
                disabled={lines.length === 0}
                onChange={() => {
                  setMethod("lines");
                }}
              />
              <span>
                <strong>From lines in this note</strong>
                <br />
                <span className={styles.muted}>
                  {lines.length > 0
                    ? `${cardCountLabel(lines.length)} found. Free and instant.`
                    : "None yet. Write lines like “term :: definition”, or Q: and A: on two lines."}
                </span>
              </span>
            </label>
            {aiPossible ? (
              <label className={`${styles.choice} ${styles.radioChoice}`}>
                <input
                  type="radio"
                  name="how"
                  checked={method === "ai"}
                  disabled={!enoughForAi}
                  onChange={() => {
                    setMethod("ai");
                  }}
                />
                <span>
                  <strong>With AI</strong>
                  <br />
                  <span className={styles.muted}>
                    {enoughForAi
                      ? "Reads the whole note and writes up to 20 question cards. Sends the note to Anthropic."
                      : "Write a few more lines first."}
                  </span>
                </span>
              </label>
            ) : null}
          </fieldset>

          <SelectField
            label="Add the cards to"
            value={destination}
            onChange={(e) => {
              setDestination(e.currentTarget.value);
            }}
          >
            <option value={NEW}>A new set named “{title}”</option>
            {sets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title} ({cardCountLabel(s.cards)})
              </option>
            ))}
          </SelectField>

          {error ? (
            <p role="alert" className={styles.formError}>
              <Icon name="warning" size={18} />
              {error}
            </p>
          ) : null}
        </div>
      </Dialog>
      <AiConsentDialog
        open={open && consent}
        onClose={() => {
          setConsent(false);
        }}
        onAllowed={() => {
          setConsent(false);
          void make();
        }}
      />
    </>
  );
}
