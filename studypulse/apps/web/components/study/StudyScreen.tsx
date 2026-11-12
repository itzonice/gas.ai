"use client";

// Study: the home of flashcards and notes. Cards due for review come first, then the
// student's card sets and notes. Everything here is read in one call (api.study.overview).
import type { StudyNoteSummary, StudyOverview, StudySetSummary } from "@studypulse/core/api";
import { noteTitle, plainExcerpt, setSummary } from "@studypulse/core/study";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import { useApi } from "@/components/auth/SessionProvider";
import { AddCourseDialog } from "@/components/courses/AddCourseDialog";
import {
  Button,
  courseVars,
  EmptyState,
  Icon,
  MetricCard,
  MetricGrid,
  OverflowMenu,
  PageHeader,
  SelectField,
  useUndoDelete,
} from "@/components/ui";

import { NewNoteDialog, NewSetDialog } from "./CreateDialogs";
import styles from "./study.module.css";
import { LoadGate, useLoad } from "./useLoad";

const when = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

export function StudyScreen() {
  const api = useApi();
  const router = useRouter();
  const fetcher = useCallback(() => api.study.overview(), [api]);
  const { state, refresh, update } = useLoad(fetcher);
  const [dialog, setDialog] = useState<"set" | "note" | "course" | null>(null);
  const [courseFilter, setCourseFilter] = useState("");
  const [message, setMessage] = useState("");

  const undo = useUndoDelete({
    onError: () => {
      setMessage("Couldn't delete that. It's back in your list.");
    },
    onCommitted: () => void refresh(),
  });

  const overview = state.status === "ready" ? state.data : null;
  const courses = overview?.courses ?? [];
  const dueTotal = useMemo(
    () => (overview?.sets ?? []).reduce((sum, s) => sum + s.due, 0),
    [overview],
  );

  const open = (kind: "set" | "note") => {
    setDialog(courses.length === 0 ? "course" : kind);
  };

  return (
    <div className="sp-page">
      <div className={styles.content}>
        <PageHeader
          title="Study"
          description="Flashcards, practice, and notes for your courses."
          primaryAction={
            dueTotal > 0
              ? { label: `Review ${String(dueTotal)} due`, icon: "play", href: "/study/review" }
              : {
                  label: "New card set",
                  icon: "add",
                  onClick: () => {
                    open("set");
                  },
                }
          }
          secondaryActions={[
            ...(dueTotal > 0
              ? [
                  {
                    label: "New card set",
                    onSelect: () => {
                      open("set");
                    },
                  },
                ]
              : []),
            {
              label: "New note",
              onSelect: () => {
                open("note");
              },
            },
            {
              label: "Add a course",
              onSelect: () => {
                setDialog("course");
              },
            },
          ]}
        />

        <LoadGate state={state} what="your study sets" onRetry={() => void refresh()}>
          {(data) => {
            const filter = courseFilter && data.courses.some((c) => c.id === courseFilter);
            const sets = data.sets
              .filter((s) => !undo.hidden.has(s.id))
              .filter((s) => !filter || s.course_id === courseFilter);
            const notes = data.notes
              .filter((n) => !undo.hidden.has(n.id))
              .filter((n) => !filter || n.course_id === courseFilter);
            return (
              <>
                <MetricGrid label="Study at a glance">
                  <MetricCard
                    label="Due for review"
                    value={String(dueTotal)}
                    detail={
                      dueTotal === 0
                        ? "Nothing due right now"
                        : `${String(dueTotal)} ${dueTotal === 1 ? "card" : "cards"} ready`
                    }
                  />
                  <MetricCard
                    label="Reviewed today"
                    value={String(data.reviewed_today)}
                    detail={data.reviewed_today === 1 ? "card" : "cards"}
                  />
                  <MetricCard
                    label="Card sets"
                    value={String(data.sets.length)}
                    detail={`${String(data.sets.reduce((n, s) => n + s.cards, 0))} cards in all`}
                  />
                  <MetricCard
                    label="Notes"
                    value={String(data.notes.length)}
                    detail={
                      data.notes.some((n) => n.pinned) ? "Pinned notes first" : "Newest first"
                    }
                  />
                </MetricGrid>

                {data.courses.length === 0 ? (
                  <EmptyState
                    icon="courses"
                    title="Add a course to get started"
                    action={{
                      label: "Add a course",
                      icon: "add",
                      onClick: () => {
                        setDialog("course");
                      },
                    }}
                  >
                    Card sets and notes belong to a course. Add one by hand, or upload a syllabus
                    and StudyPulse builds it for you.
                  </EmptyState>
                ) : (
                  <>
                    {data.courses.length > 1 ? (
                      <div className={styles.narrow} style={{ marginInline: 0 }}>
                        <SelectField
                          label="Show"
                          value={courseFilter}
                          onChange={(e) => {
                            setCourseFilter(e.currentTarget.value);
                          }}
                        >
                          <option value="">All courses</option>
                          {data.courses.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.code ? `${c.code} ${c.name}` : c.name}
                            </option>
                          ))}
                        </SelectField>
                      </div>
                    ) : null}

                    <section className={styles.section} aria-labelledby="sets-heading">
                      <div className={styles.sectionHeader}>
                        <h2 id="sets-heading" className={styles.sectionHeading}>
                          Card sets
                        </h2>
                        <Button
                          variant="tonal"
                          icon="add"
                          onClick={() => {
                            open("set");
                          }}
                        >
                          New card set
                        </Button>
                      </div>
                      {sets.length === 0 ? (
                        <EmptyState
                          icon="study"
                          title="No card sets yet"
                          headingLevel={3}
                          action={{
                            label: "Make your first set",
                            icon: "add",
                            onClick: () => {
                              open("set");
                            },
                          }}
                        >
                          Type cards in, paste them from Quizlet or a spreadsheet, or turn a note
                          into cards.
                        </EmptyState>
                      ) : (
                        <ul className={`${styles.list} ${styles.setList}`} aria-label="Card sets">
                          {sets.map((s) => (
                            <SetItem
                              key={s.id}
                              set={s}
                              course={data.courses.find((c) => c.id === s.course_id)}
                              onDelete={() => {
                                undo.remove(
                                  { id: s.id, label: `Deleted “${s.title}” and its cards.` },
                                  () => api.sets.remove(s.id),
                                );
                              }}
                            />
                          ))}
                        </ul>
                      )}
                    </section>

                    <section className={styles.section} aria-labelledby="notes-heading">
                      <div className={styles.sectionHeader}>
                        <h2 id="notes-heading" className={styles.sectionHeading}>
                          Notes
                        </h2>
                        <Button
                          variant="tonal"
                          icon="add"
                          onClick={() => {
                            open("note");
                          }}
                        >
                          New note
                        </Button>
                      </div>
                      {notes.length === 0 ? (
                        <EmptyState
                          icon="description"
                          title="No notes yet"
                          headingLevel={3}
                          action={{
                            label: "Write a note",
                            icon: "add",
                            onClick: () => {
                              open("note");
                            },
                          }}
                        >
                          Take notes in class, then turn the key terms into flashcards.
                        </EmptyState>
                      ) : (
                        <ul className={`${styles.list} ${styles.setList}`} aria-label="Notes">
                          {notes.map((n) => (
                            <NoteItem
                              key={n.id}
                              note={n}
                              course={data.courses.find((c) => c.id === n.course_id)}
                              onDelete={() => {
                                undo.remove({ id: n.id, label: `Deleted “${noteTitle(n)}”.` }, () =>
                                  api.notes.remove(n.id),
                                );
                              }}
                            />
                          ))}
                        </ul>
                      )}
                    </section>
                  </>
                )}
              </>
            );
          }}
        </LoadGate>

        <p role="status" className="sp-visually-hidden">
          {message}
        </p>
        {undo.toast}

        <NewSetDialog
          open={dialog === "set"}
          courses={courses}
          defaultCourseId={courseFilter || undefined}
          onClose={() => {
            setDialog(null);
          }}
          onCreated={(set) => {
            setDialog(null);
            router.push(`/study/sets/${set.id}`);
          }}
        />
        <NewNoteDialog
          open={dialog === "note"}
          courses={courses}
          defaultCourseId={courseFilter || undefined}
          onClose={() => {
            setDialog(null);
          }}
          onCreated={(note) => {
            setDialog(null);
            router.push(`/study/notes/${note.id}`);
          }}
        />
        <AddCourseDialog
          open={dialog === "course"}
          usedColors={courses.map((c) => c.color)}
          onClose={() => {
            setDialog(null);
          }}
          onCreated={(course) => {
            update((data: StudyOverview) => ({
              ...data,
              courses: [
                ...data.courses,
                { id: course.id, name: course.name, code: course.code, color: null },
              ],
            }));
            setDialog(null);
            void refresh();
          }}
        />
      </div>
    </div>
  );
}

type CourseChip = StudyOverview["courses"][number] | undefined;

function CourseTag({ course }: { course: CourseChip }) {
  if (!course) return null;
  return <span>{course.code ?? course.name}</span>;
}

function SetItem({
  set,
  course,
  onDelete,
}: {
  set: StudySetSummary;
  course: CourseChip;
  onDelete: () => void;
}) {
  return (
    <li
      className={styles.item}
      style={{ ["--stripe" as string]: courseVars(course?.color).stripe }}
    >
      <Link href={`/study/sets/${set.id}`} className={styles.itemLink}>
        <span className={styles.itemTitle}>{set.title}</span>
        <span className={styles.itemMeta}>
          <CourseTag course={course} />
          <span>{setSummary(set)}</span>
        </span>
        {set.due > 0 ? (
          <span className={`${styles.pill} ${styles.pillDue}`}>
            <Icon name="play" size={14} />
            {set.due} due now
          </span>
        ) : null}
      </Link>
      <div className={styles.itemMenu}>
        <OverflowMenu
          label={`More actions for ${set.title}`}
          items={[
            { label: "Open set", href: `/study/sets/${set.id}` },
            ...(set.cards > 0
              ? [{ label: "Study flashcards", href: `/study/sets/${set.id}/flashcards` }]
              : []),
            { label: "Delete set", destructive: true, onSelect: onDelete },
          ]}
        />
      </div>
    </li>
  );
}

function NoteItem({
  note,
  course,
  onDelete,
}: {
  note: StudyNoteSummary;
  course: CourseChip;
  onDelete: () => void;
}) {
  return (
    <li
      className={styles.item}
      style={{ ["--stripe" as string]: courseVars(course?.color).stripe }}
    >
      <Link href={`/study/notes/${note.id}`} className={styles.itemLink}>
        <span className={styles.itemTitle}>{noteTitle(note)}</span>
        {note.excerpt ? <span className={styles.excerpt}>{plainExcerpt(note.excerpt)}</span> : null}
        <span className={styles.itemMeta}>
          <CourseTag course={course} />
          <span>Edited {when.format(new Date(note.updated_at))}</span>
          {note.pinned ? (
            <span className={styles.pill}>
              <Icon name="star" size={14} />
              Pinned
            </span>
          ) : null}
        </span>
      </Link>
      <div className={styles.itemMenu}>
        <OverflowMenu
          label={`More actions for ${noteTitle(note)}`}
          items={[
            { label: "Open note", href: `/study/notes/${note.id}` },
            { label: "Delete note", destructive: true, onSelect: onDelete },
          ]}
        />
      </div>
    </li>
  );
}
