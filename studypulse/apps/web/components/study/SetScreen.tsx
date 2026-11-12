"use client";

// A card set: its four study modes, its cards (add, edit, star, delete with undo, paste
// to import), and download as Anki or Quizlet. Progress counts come from each card's own
// review history.
import type { SetDetail, StudyCardRow } from "@studypulse/core/api";
import {
  cardCountLabel,
  isDue,
  masteryOf,
  MASTERY_LABELS,
  STUDY_MODES,
  type StudyModeId,
} from "@studypulse/core/study";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import { useApi } from "@/components/auth/SessionProvider";
import {
  CourseChip,
  EmptyState,
  Icon,
  MetricCard,
  MetricGrid,
  OverflowMenu,
  PageHeader,
  useUndoDelete,
} from "@/components/ui";
import { downloadBlob } from "@/lib/download";

import {
  AddCardsDialog,
  ConfirmDialog,
  EditCardDialog,
  EditSetDialog,
  ImportDialog,
} from "./SetDialogs";
import styles from "./study.module.css";
import { LoadGate, useLoad } from "./useLoad";

type Dialog = "add" | "import" | "edit-set" | "reset" | "delete-set" | null;

export function SetScreen({ setId }: { setId: string }) {
  const api = useApi();
  const router = useRouter();
  const made = Number(useSearchParams().get("made"));
  const fetcher = useCallback(() => api.sets.get(setId), [api, setId]);
  const { state, refresh, update } = useLoad(fetcher);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [editing, setEditing] = useState<StudyCardRow | null>(null);
  const [message, setMessage] = useState(
    Number.isInteger(made) && made > 0
      ? `Made ${String(made)} ${made === 1 ? "card" : "cards"} from your note.`
      : "",
  );

  const undo = useUndoDelete({
    onError: () => {
      setMessage("Couldn't delete that card. It's back in the set.");
    },
    onCommitted: () => void refresh(),
  });

  const detail = state.status === "ready" ? state.data : null;
  const cards = useMemo(
    () => (detail?.cards ?? []).filter((c) => !undo.hidden.has(c.id)),
    [detail, undo.hidden],
  );
  const now = useMemo(() => new Date(), [detail]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(() => {
    const due = cards.filter((c) => isDue(c, now)).length;
    const mastery = { new: 0, learning: 0, known: 0 };
    for (const c of cards) mastery[masteryOf(c)]++;
    return { due, ...mastery };
  }, [cards, now]);

  async function toggleStar(card: StudyCardRow) {
    try {
      const saved = await api.cards.update({ id: card.id, starred: !card.starred });
      update((d: SetDetail) => ({
        ...d,
        cards: d.cards.map((c) => (c.id === card.id ? saved : c)),
      }));
      setMessage(saved.starred ? "Card starred." : "Star removed.");
    } catch {
      setMessage("Couldn't change the star. Try again.");
    }
  }

  async function exportSet(format: "anki" | "quizlet") {
    if (!detail) return;
    try {
      const blob = await api.cards.export({ courseId: detail.set.course_id, setId, format });
      const base = detail.set.title.replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "") || "cards";
      downloadBlob(blob, `${base}-${format}.${format === "anki" ? "csv" : "tsv"}`);
      setMessage(
        format === "anki"
          ? "Downloaded for Anki. Open the file in Anki to import it."
          : "Downloaded for Quizlet. Paste the file's contents into Quizlet's import box.",
      );
    } catch (e) {
      setMessage(`Couldn't export: ${e instanceof Error ? e.message : "try again."}`);
    }
  }

  async function resetProgress() {
    setDialog(null);
    try {
      await api.sets.resetProgress(setId);
      setMessage("Progress reset. Every card is new again.");
      void refresh();
    } catch {
      setMessage("Couldn't reset progress. Try again.");
    }
  }

  async function deleteSet() {
    setDialog(null);
    try {
      await api.sets.remove(setId);
      router.push("/study");
    } catch {
      setMessage("Couldn't delete the set. Try again.");
    }
  }

  const enough = (min: number) => cards.length >= min;
  const hasCards = cards.length > 0;

  return (
    <div className="sp-page">
      <div className={styles.content}>
        <Link href="/study" className={styles.back}>
          <Icon name="arrowBack" size={20} />
          Study
        </Link>

        <LoadGate
          state={state}
          what="this card set"
          onRetry={() => void refresh()}
          notFound={{ title: "Card set not found", backHref: "/study", backLabel: "Back to Study" }}
        >
          {(data) => (
            <>
              <PageHeader
                title={data.set.title}
                description={
                  <>
                    <CourseChip
                      code={data.course.code ?? data.course.name}
                      colorHex={data.course.color}
                      title={data.course.name}
                    />
                    {data.set.description ? <> {data.set.description}</> : null}
                  </>
                }
                primaryAction={
                  hasCards
                    ? {
                        label: "Study flashcards",
                        icon: "play",
                        href: `/study/sets/${setId}/flashcards`,
                      }
                    : {
                        label: "Add cards",
                        icon: "add",
                        onClick: () => {
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
                        { label: "Download for Anki", onSelect: () => void exportSet("anki") },
                        {
                          label: "Download for Quizlet",
                          onSelect: () => void exportSet("quizlet"),
                        },
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
              />

              <MetricGrid label="Progress">
                <MetricCard
                  label="Cards"
                  value={String(cards.length)}
                  detail={cardCountLabel(cards.length)}
                />
                <MetricCard
                  label="Due now"
                  value={String(counts.due)}
                  detail={counts.due === 0 ? "Nothing due" : "Ready to review"}
                />
                <MetricCard
                  label="Still learning"
                  value={String(counts.learning)}
                  detail="Seen, gap under a week"
                />
                <MetricCard
                  label="Known"
                  value={String(counts.known)}
                  detail={`${String(counts.new)} new`}
                />
              </MetricGrid>

              <section className={styles.section} aria-labelledby="modes-heading">
                <h2 id="modes-heading" className={styles.sectionHeading}>
                  Study this set
                </h2>
                <ul className={styles.modes}>
                  {STUDY_MODES.map((m) => {
                    const ok = enough(m.minCards);
                    const content = (
                      <>
                        <span className={styles.modeTitle}>
                          <Icon name={MODE_ICONS[m.id]} size={22} />
                          {m.label}
                        </span>
                        <span className={styles.muted}>
                          {ok
                            ? m.description
                            : `Add at least ${String(m.minCards)} ${m.minCards === 1 ? "card" : "cards"} to use this.`}
                        </span>
                      </>
                    );
                    return (
                      <li key={m.id}>
                        {ok ? (
                          <Link href={`/study/sets/${setId}/${m.id}`} className={styles.mode}>
                            {content}
                          </Link>
                        ) : (
                          <div className={`${styles.mode} ${styles.modeDisabled}`}>{content}</div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>

              <section className={styles.section} aria-labelledby="cards-heading">
                <h2 id="cards-heading" className={styles.sectionHeading}>
                  Cards ({cards.length})
                </h2>
                {cards.length === 0 ? (
                  <EmptyState
                    icon="study"
                    title="No cards yet"
                    headingLevel={3}
                    action={{
                      label: "Add a card",
                      icon: "add",
                      onClick: () => {
                        setDialog("add");
                      },
                    }}
                  >
                    Type a card, paste a list from Quizlet or a spreadsheet, or make cards from a
                    note.
                  </EmptyState>
                ) : (
                  <ul className={styles.cardList} aria-label="Cards in this set">
                    {cards.map((c) => (
                      <li key={c.id} className={styles.cardRow}>
                        <div className={styles.cardText}>
                          <span className={styles.term}>{c.front}</span>
                          <span className={styles.definition}>
                            {c.back}
                            <span className={styles.itemMeta}>
                              <span>{MASTERY_LABELS[masteryOf(c)]}</span>
                              {isDue(c, now) ? <span className={styles.pill}>Due</span> : null}
                            </span>
                          </span>
                        </div>
                        <div className={styles.cardActions}>
                          <button
                            type="button"
                            className={styles.starButton}
                            aria-pressed={c.starred}
                            aria-label={`Star ${c.front}`}
                            onClick={() => void toggleStar(c)}
                          >
                            <Icon
                              name="star"
                              {...(c.starred
                                ? {}
                                : { fill: "none", stroke: "currentColor", strokeWidth: 1.5 })}
                            />
                          </button>
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
                                    api.cards.remove(c.id),
                                  );
                                },
                              },
                            ]}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <AddCardsDialog
                open={dialog === "add"}
                setId={setId}
                courseId={data.set.course_id}
                cardCount={data.cards.length}
                onClose={() => {
                  setDialog(null);
                }}
                onAdded={(n) => {
                  setDialog(null);
                  setMessage(`${String(n)} ${n === 1 ? "card" : "cards"} added.`);
                  void refresh();
                }}
              />
              <ImportDialog
                open={dialog === "import"}
                setId={setId}
                courseId={data.set.course_id}
                cardCount={data.cards.length}
                onClose={() => {
                  setDialog(null);
                }}
                onImported={(n) => {
                  setDialog(null);
                  setMessage(`Imported ${String(n)} ${n === 1 ? "card" : "cards"}.`);
                  void refresh();
                }}
              />
              <EditSetDialog
                open={dialog === "edit-set"}
                set={data.set}
                onClose={() => {
                  setDialog(null);
                }}
                onSaved={() => {
                  setDialog(null);
                  setMessage("Set saved.");
                  void refresh();
                }}
              />
              <ConfirmDialog
                open={dialog === "reset"}
                title="Reset progress?"
                confirmLabel="Reset progress"
                danger
                onClose={() => {
                  setDialog(null);
                }}
                onConfirm={() => void resetProgress()}
              >
                Every card in this set becomes new again and loses its review schedule. The cards
                themselves stay.
              </ConfirmDialog>
              <ConfirmDialog
                open={dialog === "delete-set"}
                title="Delete this set?"
                confirmLabel="Delete set"
                danger
                onClose={() => {
                  setDialog(null);
                }}
                onConfirm={() => void deleteSet()}
              >
                This deletes “{data.set.title}” and its {cardCountLabel(data.cards.length)}. You
                can&apos;t undo this.
              </ConfirmDialog>
              <EditCardDialog
                card={editing}
                onClose={() => {
                  setEditing(null);
                }}
                onSaved={(saved) => {
                  update((d: SetDetail) => ({
                    ...d,
                    cards: d.cards.map((c) => (c.id === saved.id ? saved : c)),
                  }));
                  setEditing(null);
                  setMessage("Card saved.");
                }}
              />
            </>
          )}
        </LoadGate>

        <p role="status" className="sp-visually-hidden">
          {message}
        </p>
        {message ? (
          <p className={styles.flash} aria-hidden="true">
            {message}
          </p>
        ) : null}
        {undo.toast}
      </div>
    </div>
  );
}

const MODE_ICONS: Record<StudyModeId, "flip" | "play" | "check" | "shuffle"> = {
  flashcards: "flip",
  learn: "play",
  test: "check",
  match: "shuffle",
};
