// Sheets of a card set: add a card, edit a card, rename the set, and paste-to-import.
// Validation is shared with the server (zod in the API client). Each form is rebuilt when
// its sheet opens, so it always starts fresh.
import type { StudyCardRow } from "@studypulse/core/api";
import {
  parseCardImport,
  SKIP_REASONS,
  TERM_SEPARATOR_LABELS,
  type TermSeparator,
} from "@studypulse/core/study";
import { useMemo, useState } from "react";
import { Text, View } from "react-native";

import { errorMessage } from "../../lib/errors";
import { getApi } from "../../lib/supabase";
import { useAppTheme } from "../../theme";
import { Button, ChoiceChips, Sheet, TextField } from "../ui";

function ErrorText({ message }: { message: string | null }) {
  const theme = useAppTheme();
  return message ? (
    <Text accessibilityRole="alert" style={[theme.type.labelLarge, { color: theme.colors.error }]}>
      {message}
    </Text>
  ) : null;
}

// ------------------------------------------------------------------------- add a card

interface AddProps {
  setId: string;
  courseId: string;
  cardCount: number;
  onClose: () => void;
  /** A card was saved; the screen refreshes behind the sheet, which stays open. */
  onAdded: (added: number) => void;
}

export function AddCardSheet({ visible, ...props }: AddProps & { visible: boolean }) {
  return (
    <Sheet visible={visible} title="Add a card" onClose={props.onClose}>
      <AddCardForm {...props} />
    </Sheet>
  );
}

function AddCardForm({ setId, courseId, cardCount, onClose, onAdded }: AddProps) {
  const theme = useAppTheme();
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [errors, setErrors] = useState<{ front?: string; back?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(0);

  async function save(then: "more" | "done") {
    const next: typeof errors = {};
    if (!front.trim()) next.front = "Add a term.";
    if (!back.trim()) next.back = "Add a definition.";
    setErrors(next);
    if (next.front ?? next.back) return;
    setError(null);
    setBusy(true);
    try {
      await getApi().cards.add({
        setId,
        courseId,
        cards: [{ front, back }],
        startPosition: cardCount + added,
      });
      setFront("");
      setBack("");
      setBusy(false);
      setAdded((n) => n + 1);
      onAdded(1);
      if (then === "done") onClose();
    } catch (e) {
      setError(errorMessage(e, "Couldn't add the card."));
      setBusy(false);
    }
  }

  return (
    <>
      <TextField
        label="Term"
        hint="The front of the card: a word, a question, a name."
        value={front}
        onChangeText={setFront}
        error={errors.front ?? null}
        multiline
        maxLength={2000}
      />
      <TextField
        label="Definition"
        hint="The back of the card. Use / or ; between answers that are also right."
        value={back}
        onChangeText={setBack}
        error={errors.back ?? null}
        multiline
        maxLength={5000}
      />
      {added > 0 ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[theme.type.body, { color: theme.colors.onSurfaceVariant }]}
        >
          {added === 1 ? "1 card added." : `${String(added)} cards added.`}
        </Text>
      ) : null}
      <ErrorText message={error} />
      <Button
        label="Save and add another"
        variant="tonal"
        disabled={busy}
        onPress={() => void save("more")}
      />
      <Button label="Save card" disabled={busy} onPress={() => void save("done")} />
      <Button label={added > 0 ? "Done" : "Cancel"} variant="text" onPress={onClose} />
    </>
  );
}

// ------------------------------------------------------------------------ edit a card

interface EditCardProps {
  card: StudyCardRow;
  onClose: () => void;
  onSaved: (card: StudyCardRow) => void;
}

export function EditCardSheet({
  card,
  onClose,
  onSaved,
}: {
  card: StudyCardRow | null;
  onClose: () => void;
  onSaved: (card: StudyCardRow) => void;
}) {
  return (
    <Sheet visible={card !== null} title="Edit card" onClose={onClose}>
      {card ? <EditCardForm key={card.id} card={card} onClose={onClose} onSaved={onSaved} /> : null}
    </Sheet>
  );
}

function EditCardForm({ card, onClose, onSaved }: EditCardProps) {
  const [front, setFront] = useState(card.front);
  const [back, setBack] = useState(card.back);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      onSaved(await getApi().cards.update({ id: card.id, front, back }));
    } catch (e) {
      setError(errorMessage(e, "Couldn't save the card."));
      setBusy(false);
    }
  }

  return (
    <>
      <TextField label="Term" value={front} onChangeText={setFront} multiline maxLength={2000} />
      <TextField
        label="Definition"
        value={back}
        onChangeText={setBack}
        multiline
        maxLength={5000}
      />
      <ErrorText message={error} />
      <Button label={busy ? "Saving…" : "Save"} disabled={busy} onPress={() => void save()} />
      <Button label="Cancel" variant="text" onPress={onClose} />
    </>
  );
}

// ------------------------------------------------------------------------ edit the set

interface EditSetProps {
  set: { id: string; title: string; description: string | null };
  onClose: () => void;
  onSaved: () => void;
}

export function EditSetSheet({ visible, ...props }: EditSetProps & { visible: boolean }) {
  return (
    <Sheet visible={visible} title="Edit set" onClose={props.onClose}>
      <EditSetForm {...props} />
    </Sheet>
  );
}

function EditSetForm({ set, onClose, onSaved }: EditSetProps) {
  const [title, setTitle] = useState(set.title);
  const [description, setDescription] = useState(set.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!title.trim()) {
      setError("Name the set.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await getApi().sets.update({ id: set.id, title, description });
      onSaved();
    } catch (e) {
      setError(errorMessage(e, "Couldn't save the set."));
      setBusy(false);
    }
  }

  return (
    <>
      <TextField label="Set name" value={title} onChangeText={setTitle} maxLength={120} />
      <TextField
        label="Description (optional)"
        value={description}
        onChangeText={setDescription}
        multiline
        maxLength={500}
      />
      <ErrorText message={error} />
      <Button label={busy ? "Saving…" : "Save"} disabled={busy} onPress={() => void save()} />
      <Button label="Cancel" variant="text" onPress={onClose} />
    </>
  );
}

// ---------------------------------------------------------------------------- import

const SEPARATORS = Object.entries(TERM_SEPARATOR_LABELS) as [TermSeparator, string][];

interface ImportProps {
  setId: string;
  courseId: string;
  cardCount: number;
  onClose: () => void;
  onImported: (added: number) => void;
}

export function ImportSheet({ visible, ...props }: ImportProps & { visible: boolean }) {
  return (
    <Sheet visible={visible} title="Import cards" onClose={props.onClose}>
      <ImportForm {...props} />
    </Sheet>
  );
}

function ImportForm({ setId, courseId, cardCount, onClose, onImported }: ImportProps) {
  const theme = useAppTheme();
  const [text, setText] = useState("");
  const [separator, setSeparator] = useState<TermSeparator | "auto">("auto");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const result = useMemo(() => parseCardImport(text, { separator }), [text, separator]);
  const cards = result.cards.length;

  async function run() {
    if (cards === 0) return;
    setBusy(true);
    setError(null);
    try {
      await getApi().cards.add({ setId, courseId, cards: result.cards, startPosition: cardCount });
      onImported(cards);
    } catch (e) {
      setError(errorMessage(e, "Couldn't import the cards."));
      setBusy(false);
    }
  }

  return (
    <>
      <TextField
        label="Paste your cards"
        hint="One card per line: the term, a separator, then the definition. Copy them from Quizlet, Anki, or a spreadsheet."
        value={text}
        onChangeText={setText}
        multiline
        autoCapitalize="none"
        autoCorrect={false}
      />
      <ChoiceChips<TermSeparator | "auto">
        label="Between term and definition"
        value={separator}
        onChange={setSeparator}
        options={[
          { value: "auto", label: "Detect" },
          ...SEPARATORS.map(([value, label]) => ({ value, label })),
        ]}
      />
      {text.trim() ? (
        <View accessibilityLiveRegion="polite" style={{ gap: theme.spacing.half }}>
          <Text style={[theme.type.labelLarge, { color: theme.colors.onSurface }]}>
            {cards === 0
              ? "No cards found yet."
              : `${String(cards)} ${cards === 1 ? "card" : "cards"} ready to import.`}
          </Text>
          {result.skipped.slice(0, 5).map((s) => (
            <Text key={s.line} style={[theme.type.body, { color: theme.colors.onSurfaceVariant }]}>
              Line {s.line}: {SKIP_REASONS[s.reason]}
            </Text>
          ))}
          {result.skipped.length > 5 ? (
            <Text style={[theme.type.body, { color: theme.colors.onSurfaceVariant }]}>
              and {result.skipped.length - 5} more skipped
            </Text>
          ) : null}
        </View>
      ) : null}
      <ErrorText message={error} />
      <Button
        label={
          busy
            ? "Importing…"
            : cards === 0
              ? "Import"
              : `Import ${String(cards)} ${cards === 1 ? "card" : "cards"}`
        }
        disabled={busy || cards === 0}
        onPress={() => void run()}
      />
      <Button label="Cancel" variant="text" onPress={onClose} />
    </>
  );
}
