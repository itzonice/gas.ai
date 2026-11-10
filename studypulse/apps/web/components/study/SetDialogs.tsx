"use client";

// The dialogs of a card set: add cards, edit a card, rename the set, paste-import, and
// confirm a progress reset. All validation is shared with the server (zod in the API client).
import { ApiError, type StudyCardRow } from "@studypulse/core/api";
import {
  parseCardImport,
  SKIP_REASONS,
  TERM_SEPARATOR_LABELS,
  type TermSeparator,
} from "@studypulse/core/study";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import { useApi } from "@/components/auth/SessionProvider";
import { Button, Dialog, Icon, SelectField, TextArea, TextField } from "@/components/ui";

import styles from "./study.module.css";

function errorText(e: unknown, fallback: string): string {
  if (e instanceof ApiError && e.issues.length) return e.issues.map((i) => i.message).join(" ");
  return e instanceof Error ? e.message : fallback;
}

function FormError({ message }: { message: string | null }) {
  return message ? (
    <p role="alert" className={styles.formError}>
      <Icon name="warning" size={18} />
      {message}
    </p>
  ) : null;
}

export function AddCardsDialog({
  open,
  setId,
  courseId,
  cardCount,
  onClose,
  onAdded,
}: {
  open: boolean;
  setId: string;
  courseId: string;
  cardCount: number;
  onClose: () => void;
  onAdded: (added: number) => void;
}) {
  const api = useApi();
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ front?: string; back?: string }>({});
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(0);
  const [focusKey, setFocusKey] = useState(0);

  useEffect(() => {
    if (!open) return;
    /* eslint-disable react-hooks/set-state-in-effect -- resetting the form on open */
    setFront("");
    setBack("");
    setError(null);
    setFieldErrors({});
    setBusy(false);
    setAdded(0);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open]);

  useEffect(() => {
    if (open) document.getElementById("add-card-front")?.focus();
  }, [open, focusKey]);

  async function save(then: "more" | "done") {
    const errors: typeof fieldErrors = {};
    if (!front.trim()) errors.front = "Add a term.";
    if (!back.trim()) errors.back = "Add a definition.";
    setFieldErrors(errors);
    if (errors.front ?? errors.back) return;
    setError(null);
    setBusy(true);
    try {
      await api.cards.add({
        setId,
        courseId,
        cards: [{ front, back }],
        startPosition: cardCount + added,
      });
      setAdded((n) => n + 1);
      setFront("");
      setBack("");
      setBusy(false);
      if (then === "done") onAdded(added + 1);
      else setFocusKey((k) => k + 1);
    } catch (e) {
      setError(errorText(e, "Couldn't add the card."));
      setBusy(false);
    }
  }

  function close() {
    if (added > 0) onAdded(added);
    else onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Add a card"
      labelledBy="add-card-title"
      footer={
        <>
          <Button variant="text" onClick={close}>
            {added > 0 ? "Done" : "Cancel"}
          </Button>
          <Button variant="tonal" disabled={busy} onClick={() => void save("more")}>
            Save and add another
          </Button>
          <Button variant="filled" disabled={busy} onClick={() => void save("done")}>
            Save card
          </Button>
        </>
      }
    >
      <form
        className={styles.formGrid}
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void save("more");
        }}
        noValidate
      >
        <TextArea
          id="add-card-front"
          label="Term"
          hint="The front of the card: a word, a question, a name."
          value={front}
          onChange={(e) => {
            setFront(e.currentTarget.value);
          }}
          error={fieldErrors.front ?? null}
          rows={2}
          maxLength={2000}
        />
        <TextArea
          label="Definition"
          hint="The back of the card. Use / or ; between answers that are also right."
          value={back}
          onChange={(e) => {
            setBack(e.currentTarget.value);
          }}
          error={fieldErrors.back ?? null}
          rows={3}
          maxLength={5000}
        />
        {added > 0 ? (
          <p role="status" className={styles.flash}>
            {added === 1 ? "1 card added." : `${String(added)} cards added.`}
          </p>
        ) : null}
        <FormError message={error} />
      </form>
    </Dialog>
  );
}

export function EditCardDialog({
  card,
  onClose,
  onSaved,
}: {
  card: StudyCardRow | null;
  onClose: () => void;
  onSaved: (card: StudyCardRow) => void;
}) {
  const api = useApi();
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- loading the card into the form */
    setFront(card?.front ?? "");
    setBack(card?.back ?? "");
    setError(null);
    setBusy(false);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [card]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!card) return;
    setBusy(true);
    setError(null);
    try {
      onSaved(await api.cards.update({ id: card.id, front, back }));
    } catch (e) {
      setError(errorText(e, "Couldn't save the card."));
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={card !== null}
      onClose={onClose}
      title="Edit card"
      labelledBy="edit-card-title"
      footer={
        <>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="filled" type="submit" form="edit-card-form" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <form id="edit-card-form" className={styles.formGrid} onSubmit={(e) => void onSubmit(e)}>
        <TextArea
          label="Term"
          value={front}
          onChange={(e) => {
            setFront(e.currentTarget.value);
          }}
          rows={2}
          maxLength={2000}
        />
        <TextArea
          label="Definition"
          value={back}
          onChange={(e) => {
            setBack(e.currentTarget.value);
          }}
          rows={3}
          maxLength={5000}
        />
        <FormError message={error} />
      </form>
    </Dialog>
  );
}

export function EditSetDialog({
  open,
  set,
  onClose,
  onSaved,
}: {
  open: boolean;
  set: { id: string; title: string; description: string | null };
  onClose: () => void;
  onSaved: () => void;
}) {
  const api = useApi();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    /* eslint-disable react-hooks/set-state-in-effect -- loading the set into the form */
    setTitle(set.title);
    setDescription(set.description ?? "");
    setError(null);
    setBusy(false);
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when it opens
  }, [open]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) {
      setError("Name the set.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.sets.update({ id: set.id, title, description });
      onSaved();
    } catch (e) {
      setError(errorText(e, "Couldn't save the set."));
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Edit set"
      labelledBy="edit-set-title"
      footer={
        <>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="filled" type="submit" form="edit-set-form" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <form
        id="edit-set-form"
        className={styles.formGrid}
        onSubmit={(e) => void onSubmit(e)}
        noValidate
      >
        <TextField
          label="Set name"
          value={title}
          onChange={(e) => {
            setTitle(e.currentTarget.value);
          }}
          maxLength={120}
          autoComplete="off"
        />
        <TextArea
          label="Description (optional)"
          value={description}
          onChange={(e) => {
            setDescription(e.currentTarget.value);
          }}
          rows={3}
          maxLength={500}
        />
        <FormError message={error} />
      </form>
    </Dialog>
  );
}

const SEPARATORS = Object.entries(TERM_SEPARATOR_LABELS) as [TermSeparator, string][];

export function ImportDialog({
  open,
  setId,
  courseId,
  cardCount,
  onClose,
  onImported,
}: {
  open: boolean;
  setId: string;
  courseId: string;
  cardCount: number;
  onClose: () => void;
  onImported: (added: number) => void;
}) {
  const api = useApi();
  const [text, setText] = useState("");
  const [separator, setSeparator] = useState<TermSeparator | "auto">("auto");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    /* eslint-disable react-hooks/set-state-in-effect -- resetting the form on open */
    setText("");
    setSeparator("auto");
    setError(null);
    setBusy(false);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open]);

  const result = useMemo(() => parseCardImport(text, { separator }), [text, separator]);

  async function onImport() {
    if (result.cards.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await api.cards.add({ setId, courseId, cards: result.cards, startPosition: cardCount });
      onImported(result.cards.length);
    } catch (e) {
      setError(errorText(e, "Couldn't import the cards."));
      setBusy(false);
    }
  }

  const cards = result.cards.length;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Import cards"
      labelledBy="import-cards-title"
      variant="side"
      footer={
        <>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="filled" disabled={busy || cards === 0} onClick={() => void onImport()}>
            {busy
              ? "Importing…"
              : cards === 0
                ? "Import"
                : `Import ${String(cards)} ${cards === 1 ? "card" : "cards"}`}
          </Button>
        </>
      }
    >
      <div className={styles.formGrid}>
        <TextArea
          label="Paste your cards"
          hint="One card per line: the term, a separator, then the definition. Copy them from Quizlet, Anki, or a spreadsheet."
          value={text}
          onChange={(e) => {
            setText(e.currentTarget.value);
          }}
          rows={8}
          placeholder={"Mitosis\tCell division that makes two identical cells"}
        />
        <SelectField
          label="Between term and definition"
          value={separator}
          onChange={(e) => {
            setSeparator(e.currentTarget.value as TermSeparator | "auto");
          }}
        >
          <option value="auto">Detect automatically</option>
          {SEPARATORS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </SelectField>
        {text.trim() ? (
          <div className={styles.importPreview} role="status">
            <strong>
              {cards === 0
                ? "No cards found yet."
                : `${String(cards)} ${cards === 1 ? "card" : "cards"} ready to import.`}
            </strong>
            {result.cards.slice(0, 3).map((c, i) => (
              <span key={i} className={styles.muted}>
                {c.front} — {c.back}
              </span>
            ))}
            {cards > 3 ? <span className={styles.muted}>and {cards - 3} more</span> : null}
            {result.skipped.length > 0 ? (
              <>
                <span>
                  {result.skipped.length} {result.skipped.length === 1 ? "line" : "lines"} skipped:
                </span>
                <ul className={styles.skippedList}>
                  {result.skipped.slice(0, 5).map((s) => (
                    <li key={s.line}>
                      Line {s.line}: {SKIP_REASONS[s.reason]}
                    </li>
                  ))}
                  {result.skipped.length > 5 ? <li>and {result.skipped.length - 5} more</li> : null}
                </ul>
              </>
            ) : null}
          </div>
        ) : null}
        <FormError message={error} />
      </div>
    </Dialog>
  );
}

export function ConfirmDialog({
  open,
  title,
  confirmLabel,
  danger,
  onClose,
  onConfirm,
  children,
}: {
  open: boolean;
  title: string;
  confirmLabel: string;
  danger?: boolean;
  onClose: () => void;
  onConfirm: () => void;
  children: React.ReactNode;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      labelledBy="confirm-title"
      footer={
        <>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={danger ? "danger" : "filled"} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p style={{ margin: 0 }}>{children}</p>
    </Dialog>
  );
}
