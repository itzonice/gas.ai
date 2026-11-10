"use client";

// The note taker. Notes belong to a course and save by themselves: a moment after you stop
// typing, when you leave a field, and when you close the tab; the status line says Saved,
// Saving, or what went wrong, and the text stays put if saving fails. A small toolbar adds
// formatting, a Preview tab shows the result, and "Make flashcards" turns the key terms
// into a card set.
import type { Note, StudyOverview } from "@studypulse/core/api";
import {
  insertCardLine,
  noteAsText,
  noteFileName,
  noteStats,
  noteTitle,
  parseNoteBlocks,
  prefixLines,
  saveStateLabel,
  wordCountLabel,
  wrapSelection,
  type NoteBlock,
  type NoteSpan,
  type SaveState,
  type Selection,
} from "@studypulse/core/study";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { useApi } from "@/components/auth/SessionProvider";
import { Button, Icon, OverflowMenu, SelectField } from "@/components/ui";
import { downloadBlob } from "@/lib/download";

import { MakeCardsDialog } from "./MakeCardsDialog";
import { ConfirmDialog } from "./SetDialogs";
import styles from "./study.module.css";
import { LoadGate, useLoad } from "./useLoad";

const SAVE_DELAY_MS = 1200;
const RETRY_DELAY_MS = 6000;

export function NoteScreen({ noteId }: { noteId: string }) {
  const api = useApi();
  const fetcher = useCallback(async () => {
    const [note, overview] = await Promise.all([api.notes.get(noteId), api.study.overview()]);
    return { note, overview };
  }, [api, noteId]);
  const { state, refresh } = useLoad(fetcher);

  return (
    <div className="sp-page">
      <div className={`${styles.content} ${styles.narrow}`} style={{ maxWidth: "860px" }}>
        <Link href="/study" className={styles.back}>
          <Icon name="arrowBack" size={20} />
          Study
        </Link>
        <LoadGate
          state={state}
          what="this note"
          onRetry={() => void refresh()}
          notFound={{ title: "Note not found", backHref: "/study", backLabel: "Back to Study" }}
        >
          {({ note, overview }) => <Editor key={note.id} note={note} overview={overview} />}
        </LoadGate>
      </div>
    </div>
  );
}

function Editor({ note, overview }: { note: Note; overview: StudyOverview }) {
  const api = useApi();
  const router = useRouter();
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [pinned, setPinned] = useState(note.pinned);
  const [courseId, setCourseId] = useState(note.course_id);
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [save, setSave] = useState<SaveState>({ status: "idle" });
  const [dialog, setDialog] = useState<"cards" | "delete" | null>(null);
  const [message, setMessage] = useState("");
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // What still has to be saved lives in refs: the save runs from timers and page events,
  // where state from an old render would be stale.
  const latest = useRef({ title: note.title, body: note.body });
  const dirty = useRef(false);
  const saving = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const deleted = useRef(false);
  // flush schedules its own retry, so it reaches itself through a ref.
  const flushRef = useRef<() => Promise<void>>(() => Promise.resolve());

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current);
    timer.current = undefined;
    if (saving.current || !dirty.current || deleted.current) return;
    saving.current = true;
    dirty.current = false;
    setSave({ status: "saving" });
    const sent = latest.current;
    try {
      await api.notes.update({ id: note.id, title: sent.title, body: sent.body });
      setSave(dirty.current ? { status: "dirty" } : { status: "saved", at: new Date() });
    } catch (e) {
      dirty.current = true;
      setSave({ status: "error", message: e instanceof Error ? e.message : "try again" });
      timer.current = window.setTimeout(() => void flushRef.current(), RETRY_DELAY_MS);
    } finally {
      saving.current = false;
      // Typed while saving: save that too.
      if (dirty.current && timer.current === undefined) {
        timer.current = window.setTimeout(() => void flushRef.current(), SAVE_DELAY_MS);
      }
    }
  }, [api, note.id]);

  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  const schedule = useCallback(() => {
    dirty.current = true;
    setSave((s) => (s.status === "saving" ? s : { status: "dirty" }));
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), SAVE_DELAY_MS);
  }, [flush]);

  useEffect(() => {
    const onHide = () => void flush();
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty.current || saving.current) {
        void flush();
        e.preventDefault();
      }
    };
    window.addEventListener("pagehide", onHide);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
      void flush();
      window.clearTimeout(timer.current);
    };
  }, [flush]);

  function changeTitle(value: string) {
    setTitle(value);
    latest.current = { ...latest.current, title: value };
    schedule();
  }
  function changeBody(value: string) {
    setBody(value);
    latest.current = { ...latest.current, body: value };
    schedule();
  }

  function format(transform: (s: Selection) => Selection) {
    const el = bodyRef.current;
    if (!el) return;
    const next = transform({ text: el.value, start: el.selectionStart, end: el.selectionEnd });
    changeBody(next.text);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(next.start, next.end);
    });
  }

  async function changePinned() {
    const next = !pinned;
    setPinned(next);
    try {
      await api.notes.update({ id: note.id, pinned: next });
      setMessage(next ? "Note pinned." : "Note unpinned.");
    } catch {
      setPinned(!next);
      setMessage("Couldn't change that. Try again.");
    }
  }

  async function changeCourse(next: string) {
    const previous = courseId;
    setCourseId(next);
    try {
      await api.notes.update({ id: note.id, courseId: next });
      setMessage("Moved to another course.");
    } catch {
      setCourseId(previous);
      setMessage("Couldn't move the note. Try again.");
    }
  }

  async function remove() {
    setDialog(null);
    try {
      deleted.current = true;
      window.clearTimeout(timer.current);
      await api.notes.remove(note.id);
      router.push("/study");
    } catch {
      deleted.current = false;
      setMessage("Couldn't delete the note. Try again.");
    }
  }

  const stats = useMemo(() => noteStats(body), [body]);
  const blocks = useMemo(() => (tab === "preview" ? parseNoteBlocks(body) : []), [tab, body]);
  const label = saveStateLabel(save);

  return (
    <>
      <header className={styles.noteLayout}>
        <div className={styles.sectionHeader}>
          <h1 className="sp-visually-hidden">{noteTitle({ title, body })}</h1>
          <div className={styles.row}>
            <Button
              variant="tonal"
              icon="study"
              onClick={() => {
                void flush();
                setDialog("cards");
              }}
            >
              Make flashcards
            </Button>
            <Button
              variant={pinned ? "filled" : "text"}
              icon="star"
              aria-pressed={pinned}
              onClick={() => void changePinned()}
            >
              {pinned ? "Pinned" : "Pin"}
            </Button>
          </div>
          <OverflowMenu
            label="More actions for this note"
            items={[
              {
                label: "Download as text",
                onSelect: () => {
                  downloadBlob(
                    new Blob([noteAsText({ title, body })], { type: "text/plain;charset=utf-8" }),
                    noteFileName({ title, body }),
                  );
                  setMessage("Downloaded as a text file.");
                },
              },
              {
                label: "Delete note",
                destructive: true,
                onSelect: () => {
                  setDialog("delete");
                },
              },
            ]}
          />
        </div>

        <div>
          <label htmlFor="note-title" className="sp-visually-hidden">
            Note title
          </label>
          <input
            id="note-title"
            className={styles.titleInput}
            value={title}
            onChange={(e) => {
              changeTitle(e.currentTarget.value);
            }}
            onBlur={() => void flush()}
            placeholder="Untitled note"
            maxLength={200}
            autoComplete="off"
          />
        </div>

        <SelectField
          label="Course"
          value={courseId}
          onChange={(e) => void changeCourse(e.currentTarget.value)}
        >
          {overview.courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code ? `${c.code} ${c.name}` : c.name}
            </option>
          ))}
        </SelectField>
      </header>

      <div className={styles.sectionHeader}>
        <div className={styles.tabs} role="tablist" aria-label="Note view">
          {(["write", "preview"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              id={`note-tab-${t}`}
              aria-selected={tab === t}
              aria-controls={`note-panel-${t}`}
              tabIndex={tab === t ? 0 : -1}
              className={styles.tab}
              onClick={() => {
                setTab(t);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                  e.preventDefault();
                  const next = t === "write" ? "preview" : "write";
                  setTab(next);
                  requestAnimationFrame(() => document.getElementById(`note-tab-${next}`)?.focus());
                }
              }}
            >
              {t === "write" ? "Write" : "Preview"}
            </button>
          ))}
        </div>
        <span className={styles.statusLine}>
          <span>{wordCountLabel(stats.words)}</span>
          {stats.cardLines > 0 ? (
            <span>
              {stats.cardLines} card {stats.cardLines === 1 ? "line" : "lines"}
            </span>
          ) : null}
        </span>
      </div>

      {tab === "write" ? (
        <div
          id="note-panel-write"
          role="tabpanel"
          aria-labelledby="note-tab-write"
          className={styles.noteLayout}
        >
          <div className={styles.toolbar} role="toolbar" aria-label="Formatting">
            <button
              type="button"
              className={styles.toolButton}
              onClick={() => {
                format((s) => prefixLines(s, "# "));
              }}
            >
              Heading
            </button>
            <button
              type="button"
              className={styles.toolButton}
              onClick={() => {
                format((s) => wrapSelection(s, "**", "bold text"));
              }}
            >
              Bold
            </button>
            <button
              type="button"
              className={styles.toolButton}
              onClick={() => {
                format((s) => wrapSelection(s, "*", "italic text"));
              }}
            >
              Italic
            </button>
            <button
              type="button"
              className={styles.toolButton}
              onClick={() => {
                format((s) => prefixLines(s, "- "));
              }}
            >
              Bullets
            </button>
            <button
              type="button"
              className={styles.toolButton}
              onClick={() => {
                format((s) => prefixLines(s, "- [ ] "));
              }}
            >
              Checklist
            </button>
            <button
              type="button"
              className={styles.toolButton}
              onClick={() => {
                format((s) => prefixLines(s, "> "));
              }}
            >
              Quote
            </button>
            <button
              type="button"
              className={styles.toolButton}
              title="Adds a line like “term :: definition” that can become a flashcard"
              onClick={() => {
                format(insertCardLine);
              }}
            >
              Card line
            </button>
          </div>
          <label htmlFor="note-body" className="sp-visually-hidden">
            Note
          </label>
          <textarea
            id="note-body"
            ref={bodyRef}
            className={styles.bodyInput}
            value={body}
            onChange={(e) => {
              changeBody(e.currentTarget.value);
            }}
            onBlur={() => void flush()}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
                e.preventDefault();
                void flush();
              }
            }}
            placeholder={
              "Start typing. Put a term and its definition on one line, like:\nmitosis :: cell division that makes two identical cells"
            }
            maxLength={100000}
            spellCheck
          />
        </div>
      ) : (
        <div
          id="note-panel-preview"
          role="tabpanel"
          aria-labelledby="note-tab-preview"
          className={styles.preview}
        >
          {blocks.length === 0 ? (
            <p className={styles.note}>Nothing to preview yet.</p>
          ) : (
            blocks.map((b, i) => <Block key={i} block={b} />)
          )}
        </div>
      )}

      <p className={styles.statusLine} role="status">
        {save.status === "error" ? (
          <span className={styles.statusError}>
            <Icon name="warning" size={16} /> {label}. Your text is still here; we&apos;ll keep
            trying.
          </span>
        ) : (
          <span>{label || (note.updated_at ? "All changes saved automatically." : "")}</span>
        )}
      </p>
      <p role="status" className="sp-visually-hidden">
        {message}
      </p>

      <MakeCardsDialog
        open={dialog === "cards"}
        note={{ courseId, title, body }}
        onClose={() => {
          setDialog(null);
        }}
        onMade={(setId, count) => {
          setDialog(null);
          router.push(`/study/sets/${setId}?made=${String(count)}`);
        }}
      />
      <ConfirmDialog
        open={dialog === "delete"}
        title="Delete this note?"
        confirmLabel="Delete note"
        danger
        onClose={() => {
          setDialog(null);
        }}
        onConfirm={() => void remove()}
      >
        This deletes “{noteTitle({ title, body })}”. You can&apos;t undo this. Download it first if
        you want a copy.
      </ConfirmDialog>
    </>
  );
}

function Spans({ spans }: { spans: NoteSpan[] }): ReactNode {
  return spans.map((s, i) =>
    s.type === "bold" ? (
      <strong key={i}>{s.text}</strong>
    ) : s.type === "italic" ? (
      <em key={i}>{s.text}</em>
    ) : s.type === "code" ? (
      <code key={i}>{s.text}</code>
    ) : (
      <span key={i}>{s.text}</span>
    ),
  );
}

/** One block of the preview, built as React elements (never as raw HTML). */
function Block({ block }: { block: NoteBlock }) {
  switch (block.type) {
    case "heading":
      return block.level === 1 ? (
        <h2>
          <Spans spans={block.spans} />
        </h2>
      ) : (
        <h3>
          <Spans spans={block.spans} />
        </h3>
      );
    case "paragraph":
      return (
        <p>
          <Spans spans={block.spans} />
        </p>
      );
    case "list": {
      const items = block.items.map((spans, i) => (
        <li key={i}>
          <Spans spans={spans} />
        </li>
      ));
      return block.ordered ? <ol>{items}</ol> : <ul>{items}</ul>;
    }
    case "checklist":
      return (
        <ul style={{ listStyle: "none", paddingInlineStart: 0 }}>
          {block.items.map((item, i) => (
            <li key={i} className={styles.checkRow}>
              <Icon name={item.done ? "check" : "close"} size={18} />
              <span className="sp-visually-hidden">{item.done ? "Done: " : "To do: "}</span>
              <span style={item.done ? { textDecoration: "line-through" } : undefined}>
                <Spans spans={item.spans} />
              </span>
            </li>
          ))}
        </ul>
      );
    case "card":
      return (
        <div className={styles.previewCard}>
          <strong>{block.front}</strong>
          <span>{block.back}</span>
        </div>
      );
    case "quote":
      return (
        <blockquote>
          <Spans spans={block.spans} />
        </blockquote>
      );
    case "divider":
      return <hr className={styles.previewHr} />;
  }
}
