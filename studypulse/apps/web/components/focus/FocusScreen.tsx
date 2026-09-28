"use client";

// Focus: a large countdown linked to a task, today's minutes and streak, and recent
// sessions. Each stretch of running time is a study session on the server (pausing
// stops it, resuming starts a new one). The screen only announces start, pause, and
// finish through a polite live region; the clock itself is never announced.
import { ApiError, type FocusOverview } from "@studypulse/core/api";
import { useCallback, useEffect, useRef, useState } from "react";

import { useApi } from "@/components/auth/SessionProvider";
import { dueText, formatMinutes } from "@studypulse/core/screens";
import {
  Button,
  CheckboxField,
  CourseChip,
  EmptyState,
  Icon,
  MetricCard,
  MetricGrid,
  PageHeader,
  SelectField,
} from "@/components/ui";
import { allowNotifications, notifyIfHidden, playChime } from "@/lib/focus-alerts";

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
  alertText,
  breakAfter,
  DEFAULT_FOCUS_PREFS,
  FOCUS_PREFS_KEY,
  parseFocusPrefs,
  sessionsToday,
  type FocusPrefs,
  reconcile,
  remainingMs,
  sessionWhen,
  targetFromLinked,
  targetOptions,
  type FocusRun,
  type FocusTarget,
} from "@studypulse/core/screens";

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
// Timer-end choices (L4) are kept in this browser.
function readPrefs(): FocusPrefs {
  try {
    return parseFocusPrefs(window.localStorage.getItem(FOCUS_PREFS_KEY));
  } catch {
    return DEFAULT_FOCUS_PREFS;
  }
}
function writePrefs(prefs: FocusPrefs) {
  try {
    window.localStorage.setItem(FOCUS_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Storage blocked: the choice lasts until the page is reloaded.
  }
}

type BreakState =
  { offer: { minutes: number; long: boolean } } | { endsAt: number; minutes: number };

function writeStoredRun(run: FocusRun | null) {
  try {
    if (run) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(run));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable (private window, blocked): the run just won't survive a reload.
  }
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
  const [prefs, setPrefsState] = useState<FocusPrefs>(DEFAULT_FOCUS_PREFS);
  const [prefsNote, setPrefsNote] = useState("");
  const [breakState, setBreakState] = useState<BreakState | null>(null);
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
    setBreakState(null);
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
        setLength(run.lengthMinutes);
        const minutes = Math.floor(studied / 60_000);
        if (!early) {
          if (prefs.sound) playChime();
          if (prefs.notify) {
            notifyIfHidden(
              alertText.finishedTitle,
              alertText.finishedBody(run.target.title, minutes),
            );
          }
        }
        const fresh = await refresh().catch(() => null);
        const offer =
          !early && prefs.breaks && fresh
            ? breakAfter(minutes, sessionsToday(fresh.history, fresh.today, fresh.timezone))
            : null;
        setBreakState(offer ? { offer } : null);
        setAnnouncement(
          offer
            ? `${announce.finish(run, studied, early)} ${alertText.breakOffer(offer)}`
            : announce.finish(run, studied, early),
        );
      } catch (e) {
        setError(`Couldn't end the session: ${e instanceof Error ? e.message : "try again."}`);
      } finally {
        setBusy(false);
        finishing.current = false;
      }
    },
    [api, prefs, refresh, run, setRun],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read this browser's choices once
    setPrefsState(readPrefs());
  }, []);

  function setPrefs(next: FocusPrefs) {
    setPrefsState(next);
    writePrefs(next);
  }

  async function changeNotify(on: boolean) {
    setPrefsNote("");
    if (!on) {
      setPrefs({ ...prefs, notify: false });
      return;
    }
    const allowed = await allowNotifications();
    setPrefs({ ...prefs, notify: allowed });
    if (!allowed) {
      setPrefsNote(
        "Notifications are blocked for this site. Allow them in your browser's site settings, then try again.",
      );
    }
  }

  // A running break counts down on its own and chimes when it's over.
  useEffect(() => {
    if (!breakState || !("endsAt" in breakState)) return;
    const id = window.setInterval(() => {
      const t = Date.now();
      setNow(new Date(t));
      if (t < breakState.endsAt) return;
      window.clearInterval(id);
      setBreakState(null);
      if (prefs.sound) playChime();
      if (prefs.notify) notifyIfHidden(alertText.breakOver, "");
      setAnnouncement(alertText.breakOver);
    }, 1000);
    return () => {
      window.clearInterval(id);
    };
  }, [breakState, prefs]);

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

            {phase === "idle" && breakState ? (
              <div className={styles.break} role="group" aria-label="Break">
                {"offer" in breakState ? (
                  <>
                    <p>{alertText.breakOffer(breakState.offer)}</p>
                    <div className={styles.controls}>
                      <Button
                        variant="tonal"
                        onClick={() => {
                          const endsAt = Date.now() + breakState.offer.minutes * 60_000;
                          setNow(new Date());
                          setBreakState({ endsAt, minutes: breakState.offer.minutes });
                          setAnnouncement(
                            `Break started: ${String(breakState.offer.minutes)} minutes.`,
                          );
                        }}
                      >
                        Start break
                      </Button>
                      <Button
                        variant="text"
                        onClick={() => {
                          setBreakState(null);
                        }}
                      >
                        Skip break
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <p>
                      Break:{" "}
                      <span className={styles.breakClock}>
                        {formatClock(breakState.endsAt - now.getTime())}
                      </span>{" "}
                      left
                    </p>
                    <div className={styles.controls}>
                      <Button
                        variant="text"
                        onClick={() => {
                          setBreakState(null);
                          setAnnouncement("Break ended.");
                        }}
                      >
                        End break
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ) : null}

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

        {overview.courses.length > 0 ? (
          <fieldset className={styles.options}>
            <legend className={styles.optionsTitle}>When the timer ends</legend>
            <CheckboxField
              label="Play a chime"
              checked={prefs.sound}
              onChange={(e) => {
                setPrefs({ ...prefs, sound: e.currentTarget.checked });
              }}
            />
            <CheckboxField
              label="Notify me if this tab is in the background"
              hint="Your browser asks for permission the first time."
              checked={prefs.notify}
              onChange={(e) => void changeNotify(e.currentTarget.checked)}
            />
            <CheckboxField
              label="Suggest breaks"
              hint="5 minutes after a session, 15 after every fourth."
              checked={prefs.breaks}
              onChange={(e) => {
                setPrefs({ ...prefs, breaks: e.currentTarget.checked });
              }}
            />
            {prefsNote ? (
              <p role="alert" className={styles.muted}>
                {prefsNote}
              </p>
            ) : null}
          </fieldset>
        ) : null}

        {/* Only start, pause, finish, and breaks are announced. */}
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
