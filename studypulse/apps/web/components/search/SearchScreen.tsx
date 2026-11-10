"use client";

// Search across courses and assignments: the target of the app bar's search box (and the
// search button on phones). Loads the student's courses and up to 500 assignments once,
// then filters as they type; every word must match.
import type { ApiClient, CoursesOverview, StudyOverview } from "@studypulse/core/api";
import { dueText, matches, searchTerms } from "@studypulse/core/screens";
import { noteTitle } from "@studypulse/core/study";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { useApi } from "@/components/auth/SessionProvider";
import { Button, CourseChip, Icon, PageHeader, TextField } from "@/components/ui";

import styles from "./search.module.css";

type AssignmentRow = Awaited<ReturnType<ApiClient["assignments"]["list"]>>["items"][number];

type Load =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      overview: CoursesOverview;
      assignments: AssignmentRow[];
      study: StudyOverview | null;
    };

const MAX_PAGES = 5;

export function SearchScreen() {
  const api = useApi();
  const router = useRouter();
  const params = useSearchParams();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [now] = useState(() => new Date());

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const overview = await api.courses.overview();
        const assignments: AssignmentRow[] = [];
        let offset: number | null = 0;
        for (let page = 0; page < MAX_PAGES && offset !== null; page++) {
          const next = await api.assignments.list({ limit: 100, offset });
          assignments.push(...next.items);
          offset = next.nextOffset;
        }
        // Card sets and notes are a bonus: search still works if they can't be read.
        let study: StudyOverview | null = null;
        try {
          study = await api.study.overview();
        } catch {
          study = null;
        }
        if (live) setLoad({ status: "ready", overview, assignments, study });
      } catch (e) {
        if (live) {
          setLoad({
            status: "error",
            message: e instanceof Error ? e.message : "Something went wrong.",
          });
        }
      }
    })();
    return () => {
      live = false;
    };
  }, [api, attempt]);

  const terms = useMemo(() => searchTerms(query), [query]);
  const courses = useMemo(
    () => (load.status === "ready" ? new Map(load.overview.courses.map((c) => [c.id, c])) : null),
    [load],
  );
  const found = useMemo(() => {
    if (load.status !== "ready" || !courses) return null;
    return {
      courses: load.overview.courses.filter((c) => matches(terms, c.name, c.code, c.instructor)),
      assignments: load.assignments
        .filter((a) => {
          const c = courses.get(a.course_id);
          return matches(terms, a.title, a.kind, c?.code, c?.name);
        })
        .slice(0, 50),
      sets: (load.study?.sets ?? [])
        .filter((s) => {
          const c = courses.get(s.course_id);
          return matches(terms, s.title, s.description, c?.code, c?.name);
        })
        .slice(0, 20),
      notes: (load.study?.notes ?? [])
        .filter((n) => {
          const c = courses.get(n.course_id);
          return matches(terms, noteTitle(n), n.excerpt, c?.code, c?.name);
        })
        .slice(0, 20),
    };
  }, [load, courses, terms]);

  const count = found
    ? found.courses.length + found.assignments.length + found.sets.length + found.notes.length
    : 0;
  const summary =
    terms.length === 0
      ? "Type a course, assignment, card set, or note."
      : count === 0
        ? `No matches for "${query.trim()}".`
        : `${String(count)} ${count === 1 ? "match" : "matches"} for "${query.trim()}".`;

  return (
    <div className="sp-page">
      <div className={styles.content}>
        <PageHeader title="Search" description="Find a course, assignment, card set, or note." />
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            router.replace(`/search?q=${encodeURIComponent(query.trim())}`);
          }}
        >
          <TextField
            label="Search courses, assignments, card sets, and notes"
            type="search"
            value={query}
            autoComplete="off"
            onChange={(e) => {
              setQuery(e.currentTarget.value);
            }}
          />
        </form>

        {load.status === "loading" ? (
          <p role="status" className={styles.muted}>
            Loading…
          </p>
        ) : load.status === "error" ? (
          <p role="alert" className={styles.alert}>
            <Icon name="warning" size={20} />
            Couldn&apos;t search: {load.message}
            <Button
              variant="text"
              onClick={() => {
                setLoad({ status: "loading" });
                setAttempt((n) => n + 1);
              }}
            >
              Try again
            </Button>
          </p>
        ) : (
          <>
            <p role="status" className={styles.muted}>
              {summary}
            </p>
            {found?.courses.length ? (
              <section aria-labelledby="courses-found">
                <h2 id="courses-found" className={styles.heading}>
                  Courses
                </h2>
                <ul className={styles.list}>
                  {found.courses.map((c) => (
                    <li key={c.id}>
                      <Link href={`/courses/${c.id}`} className={styles.row}>
                        <CourseChip code={c.code ?? c.name} colorHex={c.color} />
                        <span className={styles.title}>{c.name}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {found?.assignments.length ? (
              <section aria-labelledby="assignments-found">
                <h2 id="assignments-found" className={styles.heading}>
                  Assignments
                </h2>
                <ul className={styles.list}>
                  {found.assignments.map((a) => {
                    const c = courses?.get(a.course_id);
                    return (
                      <li key={a.id}>
                        <Link href={`/courses/${a.course_id}`} className={styles.row}>
                          <CourseChip code={c?.code ?? c?.name ?? "Course"} colorHex={c?.color} />
                          <span className={styles.title}>{a.title}</span>
                          <span className={styles.meta}>
                            {dueText(a.due_at, load.overview.timezone, now)}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}
            {found?.sets.length ? (
              <section aria-labelledby="sets-found">
                <h2 id="sets-found" className={styles.heading}>
                  Card sets
                </h2>
                <ul className={styles.list}>
                  {found.sets.map((s) => {
                    const c = courses?.get(s.course_id);
                    return (
                      <li key={s.id}>
                        <Link href={`/study/sets/${s.id}`} className={styles.row}>
                          <CourseChip code={c?.code ?? c?.name ?? "Course"} colorHex={c?.color} />
                          <span className={styles.title}>{s.title}</span>
                          <span className={styles.meta}>
                            {s.cards} {s.cards === 1 ? "card" : "cards"}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}
            {found?.notes.length ? (
              <section aria-labelledby="notes-found">
                <h2 id="notes-found" className={styles.heading}>
                  Notes
                </h2>
                <ul className={styles.list}>
                  {found.notes.map((n) => {
                    const c = courses?.get(n.course_id);
                    return (
                      <li key={n.id}>
                        <Link href={`/study/notes/${n.id}`} className={styles.row}>
                          <CourseChip code={c?.code ?? c?.name ?? "Course"} colorHex={c?.color} />
                          <span className={styles.title}>{noteTitle(n)}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
