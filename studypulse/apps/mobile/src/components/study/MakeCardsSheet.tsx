// Turns a note into flashcards, two ways: from the note's own lines ("term :: definition",
// or Q:/A: pairs; free and instant), or with AI (up to 20 cards; sends the note to
// Anthropic, so it asks for consent first). The cards go into a new set named after the
// note or one the course already has.
import { ApiError, type StudySetSummary } from "@studypulse/core/api";
import { cardCountLabel, cardsFromNote, noteTitle } from "@studypulse/core/study";
import { useEffect, useMemo, useState } from "react";
import { Text } from "react-native";

import { errorMessage } from "../../lib/errors";
import { getApi } from "../../lib/supabase";
import { useAppTheme } from "../../theme";
import { AiConsentSheet } from "../AiConsentSheet";
import { Button, ChoiceChips, Sheet } from "../ui";

type Method = "lines" | "ai";
const NEW = "new";

interface Props {
  note: { courseId: string; title: string; body: string };
  onClose: () => void;
  onMade: (setId: string, count: number) => void;
}

/**
 * The form is rebuilt each time the sheet opens. The AI consent prompt is a second sheet:
 * the form hides its own while that one is up.
 */
export function MakeCardsSheet({ visible, ...props }: Props & { visible: boolean }) {
  return visible ? <MakeCards {...props} /> : null;
}

function MakeCards({ note, onClose, onMade }: Props) {
  const theme = useAppTheme();
  const lines = useMemo(() => cardsFromNote(note.body), [note.body]);
  const [method, setMethod] = useState<Method>(() =>
    cardsFromNote(note.body).length > 0 ? "lines" : "ai",
  );
  const [sets, setSets] = useState<StudySetSummary[]>([]);
  const [destination, setDestination] = useState(NEW);
  const [ai, setAi] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getApi()
      .study.overview()
      .then((o) => {
        if (!cancelled) setSets(o.sets.filter((s) => s.course_id === note.courseId));
      })
      .catch(() => undefined);
    getApi()
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
  }, [note.courseId]);

  const title = noteTitle(note);
  const aiPossible = ai !== false;
  const enoughForAi = note.body.trim().length >= 40;
  const canMake = method === "lines" ? lines.length > 0 : aiPossible && enoughForAi;

  async function make() {
    const api = getApi();
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
              : errorMessage(e, "Couldn't make the cards."),
      );
    }
  }

  const methods: { value: Method; label: string }[] = [
    {
      value: "lines",
      label: lines.length > 0 ? `From my lines (${cardCountLabel(lines.length)})` : "From my lines",
    },
    ...(aiPossible ? [{ value: "ai" as const, label: "With AI" }] : []),
  ];
  const hint =
    method === "lines"
      ? lines.length > 0
        ? `${cardCountLabel(lines.length)} found in this note. Free and instant.`
        : "None yet. Write lines like “term :: definition”, or Q: and A: on two lines."
      : enoughForAi
        ? "Reads the whole note and writes up to 20 question cards. Sends the note to Anthropic."
        : "Write a few more lines first.";

  return (
    <>
      <Sheet visible={!consent} title="Make flashcards from this note" onClose={onClose}>
        <ChoiceChips<Method> label="How" value={method} onChange={setMethod} options={methods} />
        <Text style={[theme.type.body, { color: theme.colors.onSurfaceVariant }]}>{hint}</Text>
        <ChoiceChips
          label="Add the cards to"
          value={destination}
          onChange={setDestination}
          options={[
            { value: NEW, label: `New set “${title.slice(0, 30)}”` },
            ...sets.map((s) => ({ value: s.id, label: `${s.title} (${cardCountLabel(s.cards)})` })),
          ]}
        />
        {error ? (
          <Text
            accessibilityRole="alert"
            style={[theme.type.labelLarge, { color: theme.colors.error }]}
          >
            {error}
          </Text>
        ) : null}
        <Button
          label={busy ? "Making cards…" : "Make cards"}
          disabled={busy || !canMake}
          onPress={() => void make()}
        />
        <Button label="Cancel" variant="text" onPress={onClose} />
      </Sheet>
      <AiConsentSheet
        visible={consent}
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
