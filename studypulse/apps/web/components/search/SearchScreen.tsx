"use client";

// Search across courses and assignments: the target of the app bar's search box (and the
// search button on phones). Loads the student's courses and up to 500 assignments once,
// then filters as they type; every word must match.
import type { ApiClient, CoursesOverview } from "@studypulse/core/api";
import { dueText, matches, searchTerms } from "@studypulse/core/screens";
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
  | { status: "ready"; overview: CoursesOverview; assignments: AssignmentRow[] };

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
        if (live) setLoad({ status: "ready", overview, assignments });
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
    };
  }, [load, courses, terms]);

  const count = found ? found.courses.length + found.assignments.length : 0;
  const summary =
    terms.length === 0
      ? "Type a course or assignment name."
      : count === 0
        ? `No matches for "${query.trim()}".`
        : `${String(count)} ${count === 1 ? "match" : "matches"} for "${query.trim()}".`;

  return (
    <div className="sp-page">
      <div className={styles.content}>
        <PageHeader title="Search" description="Find a course or assignment." />
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            router.replace(`/search?q=${encodeURIComponent(query.trim())}`);
          }}
        >
          <TextField
            label="Search courses and assignments"
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
          </>
        )}
      </div>
    </div>
  );
}
