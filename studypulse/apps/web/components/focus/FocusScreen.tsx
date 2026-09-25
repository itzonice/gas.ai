"use client";

// Focus: a large countdown linked to a task, today's minutes and streak, and recent
// sessions. Each stretch of running time is a study session on the server (pausing
// stops it, resuming starts a new one). The screen only announces start, pause, and
// finish through a polite live region; the clock itself is never announced.
import { ApiError, type FocusOverview } from "@studypulse/core/api";
import { useCallback, useEffect, useRef, useState } from "react";

import { useApi } from "@/components/auth/SessionProvider";
import { dueText, formatMinutes } from "@/components/today/model";
import {
  Button,
  CourseChip,
  EmptyState,
  Icon,
  MetricCard,
  MetricGrid,
  PageHeader,
  SelectField,
} from "@/components/ui";

import styles from "./focus.module.css";
import {
  announce,
  clockInWords,
  defaultLength,
  elapsedMs,
  finishAt,
  formatClock,
  LENGTH_OPTIONS,
  parseStoredRun,
  phaseOf,
  remainingMs,
  sessionWhen,
  type FocusRun,
  type FocusTarget,
} from "./model";

const STORAGE_KEY = "studypulse.focus-run";

type Load =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; overview: FocusOverview };

// Browser storage only remembers the run between reloads on this device (length and
// paused time); the server's running session is the source of truth.
function readStoredRun(): FocusRun | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? parseStoredRun(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}
function writeStoredRun(run: FocusRun | null) {
  try {
    if (run) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(run));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable (private window, blocked): the run just won't survive a reload.
  }
}

function targetFromLinked(linked: NonNullable<FocusOverview["linked"]>): FocusTarget {
  return {
    courseId: linked.course_id,
    assignmentId: linked.assignment_id,
    blockId: linked.block_id,
    title: linked.title,
    courseCode: linked.course_code ?? linked.course_name,
    courseColor: linked.course_color,
    dueAt: linked.due_at,
  };
}

/** Rebuilds the run from the server: adopt a session started elsewhere, drop a stale one. */
function reconcile(stored: FocusRun | null, running: FocusOverview["running"]): FocusRun | null {
  if (running) {
    if (stored?.current?.sessionId === running.id) return stored;
    return {
      target: {
        courseId: running.course_id,
        assignmentId: running.assignment_id,
        blockId: null,
        title: running.title,
        courseCode: running.course_code ?? running.course_name,
        courseColor: running.course_color,
        dueAt: null,
      },
      lengthMinutes: defaultLength(null),
      doneMs: 0,
      current: { sessionId: running.id, startedAt: running.started_at },
    };
  }
  // A stretch we thought was running was stopped somewhere else: that run is over.
  return stored?.current ? null : stored;
}

export function FocusScreen({
  assignmentId,
  blockId,
  autoStart,
}: {
  assignmentId?: string;
  blockId?: string;
  autoStart?: boolean;
}) {
  const api = useApi();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [run, setRunState] = useState<FocusRun | null>(null);
  const [target, setTarget] = useState<FocusTarget | null>(null);
  const [length, setLength] = useState(defaultLength(null));
  const [now, setNow] = useState(() => new Date());
  const [announcement, setAnnouncement] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const autoStarted = useRef(false);
  const finishing = useRef(false);

  const setRun = useCallback((next: FocusRun | null) => {
    setRunState(next);
    writeStoredRun(next);
  }, []);

  const refresh = useCallback(async () => {
    const overview = await api.sessions.overview({
      ...(assignmentId ? { assignmentId } : {}),
      ...(blockId ? { blockId } : {}),
    });
    setLoad({ status: "ready", overview });
    return overview;
  }, [api, assignmentId, blockId]);

  // Initial load: reconcile this device's stored run with the server.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const overview = await refresh();
        if (cancelled) return;
        const current = reconcile(readStoredRun(), overview.running);
        setRun(current);
        const linked = overview.linked ? targetFromLinked(overview.linked) : null;
        setTarget(current?.target ?? linked);
        setLength(current?.lengthMinutes ?? defaultLength(overview.linked?.block_minutes));
        setNow(new Date());
      } catch (e) {
        if (!cancelled) {
          setLoad({
            status: "error",
            message: e instanceof Error ? e.message : "Something went wrong.",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh, setRun]);

  const phase = phaseOf(run);

  const startStretch = useCallback(
    async (base: FocusRun, resumed: boolean) => {
      const sessionId = crypto.randomUUID();
      const startedAt = new Date().toISOString();
      const next: FocusRun = { ...base, current: { sessionId, startedAt } };
      // Saved before the call, so a retry after a lost response reuses the same id.
      setRun(next);
      setBusy(true);
      setError("");
      try {
        await api.sessions.start({
          id: sessionId,
          courseId: base.target.courseId,
          ...(base.target.assignmentId ? { assignmentId: base.target.assignmentId } : {}),
          startedAt,
        });
        setNow(new Date());
        setAnnouncement(announce.start(next, resumed));
      } catch (e) {
        setRun(resumed ? base : null);
        setError(
          e instanceof ApiError && e.status === 409
            ? "Another focus session is already running, maybe on another device. Reload to pick it up."
            : `Couldn't start the timer: ${e instanceof Error ? e.message : "try again."}`,
        );
      } finally {
        setBusy(false);
      }
    },
    [api, setRun],
  );

  const start = useCallback(async () => {
    if (!target) {
      setError("Choose what you're working on first.");
      document.getElementById("focus-target")?.focus();
      return;
    }
    await startStretch({ target, lengthMinutes: length, doneMs: 0, current: null }, false);
  }, [length, startStretch, target]);

  async function pause() {
    if (!run?.current) return;
    const at = new Date();
    const paused: FocusRun = { ...run, doneMs: elapsedMs(run, at), current: null };
    setBusy(true);
    try {
      await api.sessions.stop({ id: run.current.sessionId, endedAt: at.toISOString() });
      setRun(paused);
      setNow(at);
      setAnnouncement(announce.pause(paused, at));
    } catch (e) {
      setError(`Couldn't pause: ${e instanceof Error ? e.message : "try again."}`);
    } finally {
      setBusy(false);
    }
  }

  const end = useCallback(
    async (early: boolean) => {
      if (!run || finishing.current) return;
      finishing.current = true;
      // A countdown that ran out while the tab slept ends exactly at its length.
      const endAt = early ? new Date() : (finishAt(run) ?? new Date());
      const studied = elapsedMs(run, endAt);
      setBusy(true);
      try {
        if (run.current && endAt.getTime() > new Date(run.current.startedAt).getTime()) {
          await api.sessions.stop({ id: run.current.sessionId, endedAt: endAt.toISOString() });
        } else if (run.current) {
          // Less than a moment long: nothing worth keeping, but it must still be stopped.
          await api.sessions.stop({ id: run.current.sessionId });
        }
        setRun(null);
        setAnnouncement(announce.finish(run, studied, early));
        setLength(run.lengthMinutes);
        await refresh().catch(() => undefined);
      } catch (e) {
        setError(`Couldn't end the session: ${e instanceof Error ? e.message : "try again."}`);
      } finally {
        setBusy(false);
        finishing.current = false;
      }
    },
    [api, refresh, run, setRun],
  );

  // Tick once a second while running; finish when the countdown reaches zero.
  useEffect(() => {
    if (phase !== "running" || !run) return;
    const id = window.setInterval(() => {
      const t = new Date();
      setNow(t);
      if (remainingMs(run, t) <= 0) void end(false);
    }, 1000);
    return () => window.clearInterval(id);
  }, [end, phase, run]);

  // "Start focus" links (?start=1) start right away when they say what to work on.
  useEffect(() => {
    if (!autoStart || autoStarted.current || load.status !== "ready") return;
    autoStarted.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time start the link asked for
    if (phase === "idle" && target && load.overview.linked) void start();
  }, [autoStart, load, phase, start, target]);

  const header = (
    <PageHeader
      title="Focus"
      description="Work on one thing at a time. Paused time doesn't count."
      {...(load.status === "ready" && load.overview.courses.length > 0
        ? {
            primaryAction:
              phase === "running"
                ? { label: "Pause", icon: "pause" as const, onClick: () => void pause() }
                : phase === "paused"
                  ? {
                      label: "Resume",
                      icon: "play" as const,
                      onClick: () => {
                        if (run) void startStretch(run, true);
                      },
                    }
                  : { label: "Start focus", icon: "play" as const, onClick: () => void start() },
          }
        : {})}
    />
  );

  if (load.status !== "ready") {
    return (
      <div className="sp-page">
        <div className={styles.content}>
          {header}
          {load.status === "loading" ? (
            <p role="status" className={styles.muted}>
              Loading your focus timer…
            </p>
          ) : (
            <p role="alert" className={styles.alert}>
              <Icon name="warning" size={20} />
              Couldn&apos;t load the focus timer: {load.message}
              <Button variant="text" onClick={() => window.location.reload()}>
                Try again
              </Button>
            </p>
          )}
        </div>
      </div>
    );
  }

  const { overview } = load;
  const tz = overview.timezone;
  const shown =
    run ?? (target ? { target, lengthMinutes: length, doneMs: 0, current: null } : null);
  const left = shown ? remainingMs(shown, now) : length * 60_000;
  const liveTarget = run?.target ?? target;

  const options = targetOptions(overview, liveTarget);
  const selected = liveTarget
    ? liveTarget.assignmentId
      ? `a:${liveTarget.assignmentId}`
      : `c:${liveTarget.courseId}`
    : "";

  function choose(value: string) {
    const option = options.find((o) => o.value === value);
    setTarget(option?.target ?? null);
    setError("");
  }

  return (
    <div className="sp-page">
      <div className={styles.content}>
        {header}

        <MetricGrid label="Your focus">
          <MetricCard
            label="Today's minutes"
            value={overview.today_minutes}
            detail={overview.today_minutes === 1 ? "minute focused today" : "minutes focused today"}
          />
          <MetricCard
            label="Streak"
            value={overview.streak_days}
            detail={
              overview.streak_days === 0
                ? "Focus today to start one"
                : overview.streak_days === 1
                  ? "day in a row"
                  : "days in a row"
            }
          />
        </MetricGrid>

        {overview.courses.length === 0 ? (
          <EmptyState
            headingLevel={2}
            icon="upload"
            title="Add a course to start focusing"
            action={{ label: "Upload a syllabus", href: "/courses/upload", icon: "upload" }}
          >
            Focus time is logged against a course, so the timer needs one first.
          </EmptyState>
        ) : (
          <section className={styles.timerCard} aria-labelledby="timer-heading">
            <h2 id="timer-heading" className="sp-visually-hidden">
              Timer
            </h2>
            <p className={styles.phase}>
              {phase === "running" ? "Focusing" : phase === "paused" ? "Paused" : "Ready"}
            </p>
            {/* role="timer" is not a live region: the time is never read out on its own. */}
            <p role="timer" className={styles.clock} aria-label={clockInWords(left)}>
              {formatClock(left)}
            </p>

            <div className={styles.linked}>
              {liveTarget ? (
                <>
                  <span className={styles.linkedTitle}>{liveTarget.title}</span>
                  <span className={styles.linkedMeta}>
                    <CourseChip code={liveTarget.courseCode} colorHex={liveTarget.courseColor} />
                    {liveTarget.dueAt ? dueText(liveTarget.dueAt, tz, now) : null}
                  </span>
                </>
              ) : (
                <span className={styles.muted}>Not linked to a task yet</span>
              )}
            </div>

            {phase === "idle" ? (
              <div className={styles.setup}>
                <SelectField
                  id="focus-target"
                  label="Working on"
                  value={selected}
                  onChange={(e) => choose(e.target.value)}
                >
                  <option value="" disabled>
                    Choose a task or course
                  </option>
                  {options.some((o) => o.group === "task") ? (
                    <optgroup label="Tasks">
                      {options
                        .filter((o) => o.group === "task")
                        .map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                    </optgroup>
                  ) : null}
                  <optgroup label="General study">
                    {options
                      .filter((o) => o.group === "course")
                      .map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                  </optgroup>
                </SelectField>
                <SelectField
                  label="Length"
                  value={String(length)}
                  onChange={(e) => setLength(Number(e.target.value))}
                >
                  {[...new Set([...LENGTH_OPTIONS, length])]
                    .sort((a, b) => a - b)
                    .map((m) => (
                      <option key={m} value={m}>
                        {formatMinutes(m)}
                      </option>
                    ))}
                </SelectField>
              </div>
            ) : (
              <div className={styles.controls}>
                <Button variant="tonal" disabled={busy} onClick={() => void end(true)}>
                  End session
                </Button>
              </div>
            )}

            {error ? (
              <p role="alert" className={styles.alert}>
                <Icon name="warning" size={20} />
                {error}
              </p>
            ) : null}
          </section>
        )}

        {/* Only start, pause, and finish are announced. */}
        <p role="status" aria-live="polite" className="sp-visually-hidden">
          {announcement}
        </p>
      </div>

      <aside className={styles.panel} aria-labelledby="history-heading">
        <section className={styles.panelCard}>
          <h2 id="history-heading" className={styles.panelTitle}>
            Session history
          </h2>
          {overview.history.length === 0 ? (
            <p className={styles.muted}>Finished sessions show up here.</p>
          ) : (
            <ul className={styles.history}>
              {overview.history.map((s) => (
                <li key={s.id} className={styles.historyRow}>
                  <span className={styles.historyTitle}>{s.title}</span>
                  <span className={styles.historyMeta}>
                    <CourseChip code={s.course_code ?? s.course_name} colorHex={s.course_color} />
                    <span>{sessionWhen(s.started_at, s.ended_at, tz)}</span>
                  </span>
                  <span className={styles.historyMinutes}>{formatMinutes(s.minutes)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>
    </div>
  );
}

interface TargetOption {
  value: string;
  label: string;
  group: "task" | "course";
  target: FocusTarget;
}

/** Open tasks (soonest due first), the current target if it's not among them, then courses. */
function targetOptions(overview: FocusOverview, current: FocusTarget | null): TargetOption[] {
  const tasks: TargetOption[] = overview.choices.map((c) => {
    const code = c.course_code ?? c.course_name;
    return {
      value: `a:${c.assignment_id}`,
      label: `${c.title} (${code})`,
      group: "task",
      target: {
        courseId: c.course_id,
        assignmentId: c.assignment_id,
        blockId: null,
        title: c.title,
        courseCode: code,
        courseColor: c.course_color,
        dueAt: c.due_at,
      },
    };
  });
  if (current?.assignmentId && !tasks.some((t) => t.value === `a:${current.assignmentId}`)) {
    tasks.unshift({
      value: `a:${current.assignmentId}`,
      label: `${current.title} (${current.courseCode})`,
      group: "task",
      target: current,
    });
  }
  const courses: TargetOption[] = overview.courses.map((c) => {
    const code = c.code ?? c.name;
    return {
      value: `c:${c.id}`,
      label: `Study ${code}`,
      group: "course",
      target: {
        courseId: c.id,
        assignmentId: null,
        blockId: null,
        title: `Study ${code}`,
        courseCode: code,
        courseColor: c.color,
        dueAt: null,
      },
    };
  });
  return [...tasks, ...courses];
}
