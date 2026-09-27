// Focus: a large countdown linked to a task or course, today's minutes and streak, and
// recent sessions. Each stretch of running time is a study session on the server (pause
// stops it, resume starts a new one), so paused time never counts. Time comes from
// timestamps, so the clock is right after the app was in the background. VoiceOver and
// TalkBack hear only start, pause, and finish, never the clock ticking.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ApiError, type FocusOverview } from "@studypulse/core/api";
import {
  alertText,
  announce as say,
  breakAfter,
  DEFAULT_FOCUS_PREFS,
  END_VIBRATION,
  FOCUS_PREFS_KEY,
  parseFocusPrefs,
  sessionsToday,
  type FocusPrefs,
  clockInWords,
  defaultLength,
  dueText,
  elapsedMs,
  finishAt,
  formatClock,
  formatMinutes,
  LENGTH_OPTIONS,
  parseStoredRun,
  phaseOf,
  reconcile,
  remainingMs,
  sessionWhen,
  targetFromLinked,
  targetOptions,
  type FocusRun,
  type FocusTarget,
} from "@studypulse/core/screens";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, Switch, Text, Vibration, View } from "react-native";

import { ListCard, SectionHeading, TabScreen } from "../../components/TabScreen";
import {
  Button,
  ChoiceChips,
  CourseChip,
  EmptyState,
  Icon,
  MetricCard,
  MetricGrid,
  Notice,
} from "../../components/ui";
import { errorMessage } from "../../lib/errors";
import { announce } from "../../lib/hooks";
import { getApi } from "../../lib/supabase";
import { uuid } from "../../lib/uuid";
import { useAppTheme } from "../../theme";

const STORAGE_KEY = "studypulse.focus-run";

// Device storage only remembers the run between launches (length and paused time); the
// server's running session is the source of truth.
async function readStoredRun(): Promise<FocusRun | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? parseStoredRun(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}
function writeStoredRun(run: FocusRun | null) {
  (run
    ? AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(run))
    : AsyncStorage.removeItem(STORAGE_KEY)
  ).catch(() => undefined);
}

type BreakState =
  { offer: { minutes: number; long: boolean } } | { endsAt: number; minutes: number };

const param = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

export default function FocusScreen() {
  const theme = useAppTheme();
  const params = useLocalSearchParams<{
    assignmentId?: string;
    blockId?: string;
    start?: string;
  }>();
  const assignmentId = param(params.assignmentId);
  const blockId = param(params.blockId);
  const autoStart = params.start === "1";

  const [overview, setOverview] = useState<FocusOverview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [run, setRunState] = useState<FocusRun | null>(null);
  const [target, setTarget] = useState<FocusTarget | null>(null);
  const [length, setLength] = useState(defaultLength(null));
  const [now, setNow] = useState(() => new Date());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const autoStarted = useRef<string | null>(null);
  const finishing = useRef(false);
  // Timer-end choices (L4), kept on this device.
  const [prefs, setPrefsState] = useState<FocusPrefs>(DEFAULT_FOCUS_PREFS);
  const [breakState, setBreakState] = useState<BreakState | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(FOCUS_PREFS_KEY).then(
      (raw) => {
        setPrefsState(parseFocusPrefs(raw));
      },
      () => undefined,
    );
  }, []);
  const setPrefs = (next: FocusPrefs) => {
    setPrefsState(next);
    AsyncStorage.setItem(FOCUS_PREFS_KEY, JSON.stringify(next)).catch(() => undefined);
  };

  const setRun = useCallback((next: FocusRun | null) => {
    setRunState(next);
    writeStoredRun(next);
  }, []);

  const refresh = useCallback(async () => {
    const next = await getApi().sessions.overview({
      ...(assignmentId ? { assignmentId } : {}),
      ...(blockId ? { blockId } : {}),
    });
    setOverview(next);
    return next;
  }, [assignmentId, blockId]);

  // Load, and reconcile this device's stored run with the server (again whenever the
  // screen is opened for a different task).
  const load = useCallback(async () => {
    try {
      const [next, stored] = await Promise.all([refresh(), readStoredRun()]);
      const current = reconcile(stored, next.running);
      setRun(current);
      setTarget(current?.target ?? (next.linked ? targetFromLinked(next.linked) : null));
      setLength(current?.lengthMinutes ?? defaultLength(next.linked?.block_minutes));
      setNow(new Date());
      setLoadError(null);
    } catch (e) {
      setLoadError(errorMessage(e));
    }
  }, [refresh, setRun]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
    void load();
  }, [load]);

  const phase = phaseOf(run);

  const startStretch = useCallback(
    async (base: FocusRun, resumed: boolean) => {
      const sessionId = uuid();
      const startedAt = new Date().toISOString();
      const next: FocusRun = { ...base, current: { sessionId, startedAt } };
      // Saved before the call, so a retry after a lost response reuses the same id.
      setRun(next);
      setBusy(true);
      setError("");
      try {
        await getApi().sessions.start({
          id: sessionId,
          courseId: base.target.courseId,
          ...(base.target.assignmentId ? { assignmentId: base.target.assignmentId } : {}),
          startedAt,
        });
        setNow(new Date());
        announce(say.start(next, resumed));
      } catch (e) {
        setRun(resumed ? base : null);
        setError(
          e instanceof ApiError && e.status === 409
            ? "Another focus session is already running, maybe on another device. Pull down to pick it up."
            : `Couldn't start the timer: ${errorMessage(e)}`,
        );
      } finally {
        setBusy(false);
      }
    },
    [setRun],
  );

  const start = useCallback(async () => {
    if (!target) {
      setError("Choose what you're working on first.");
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
      await getApi().sessions.stop({ id: run.current.sessionId, endedAt: at.toISOString() });
      setRun(paused);
      setNow(at);
      announce(say.pause(paused, at));
    } catch (e) {
      setError(`Couldn't pause: ${errorMessage(e)}`);
    } finally {
      setBusy(false);
    }
  }

  const end = useCallback(
    async (early: boolean) => {
      if (!run || finishing.current) return;
      finishing.current = true;
      // A countdown that ran out while the app was closed ends exactly at its length.
      const endAt = early ? new Date() : (finishAt(run) ?? new Date());
      const studied = elapsedMs(run, endAt);
      setBusy(true);
      try {
        if (run.current && endAt.getTime() > new Date(run.current.startedAt).getTime()) {
          await getApi().sessions.stop({ id: run.current.sessionId, endedAt: endAt.toISOString() });
        } else if (run.current) {
          await getApi().sessions.stop({ id: run.current.sessionId });
        }
        setRun(null);
        setLength(run.lengthMinutes);
        const minutes = Math.floor(studied / 60_000);
        if (!early && prefs.vibrate) Vibration.vibrate([...END_VIBRATION]);
        const fresh = await refresh().catch(() => null);
        const offer =
          !early && prefs.breaks && fresh
            ? breakAfter(minutes, sessionsToday(fresh.history, fresh.today, fresh.timezone))
            : null;
        setBreakState(offer ? { offer } : null);
        announce(
          offer
            ? `${say.finish(run, studied, early)} ${alertText.breakOffer(offer)}`
            : say.finish(run, studied, early),
        );
      } catch (e) {
        setError(`Couldn't end the session: ${errorMessage(e)}`);
      } finally {
        setBusy(false);
        finishing.current = false;
      }
    },
    [prefs, refresh, run, setRun],
  );

  // A running break counts down on its own and buzzes when it's over.
  useEffect(() => {
    if (!breakState || !("endsAt" in breakState)) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(new Date(t));
      if (t < breakState.endsAt) return;
      clearInterval(id);
      setBreakState(null);
      if (prefs.vibrate) Vibration.vibrate([...END_VIBRATION]);
      announce(alertText.breakOver);
    }, 1000);
    return () => {
      clearInterval(id);
    };
  }, [breakState, prefs]);

  // Tick once a second while running; finish when the countdown reaches zero.
  useEffect(() => {
    if (phase !== "running" || !run) return;
    const id = setInterval(() => {
      const t = new Date();
      setNow(t);
      if (remainingMs(run, t) <= 0) void end(false);
    }, 1000);
    return () => {
      clearInterval(id);
    };
  }, [end, phase, run]);

  // "Start focus" (the floating button, or a task's menu) starts right away when it says
  // what to work on; otherwise the student picks first.
  useEffect(() => {
    const key = `${assignmentId ?? ""}|${blockId ?? ""}`;
    if (!autoStart || autoStarted.current === key || !overview) return;
    autoStarted.current = key;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time start the link asked for
    if (phase === "idle" && target && overview.linked) void start();
  }, [autoStart, assignmentId, blockId, overview, phase, start, target]);

  const hasCourses = (overview?.courses.length ?? 0) > 0;
  const primaryAction = !hasCourses
    ? undefined
    : phase === "running"
      ? { label: "Pause", onPress: () => void pause() }
      : phase === "paused"
        ? {
            label: "Resume",
            onPress: () => {
              if (run) void startStretch(run, true);
            },
          }
        : { label: "Start focus", onPress: () => void start() };

  const tz = overview?.timezone ?? "UTC";
  const shown =
    run ?? (target ? { target, lengthMinutes: length, doneMs: 0, current: null } : null);
  const left = shown ? remainingMs(shown, now) : length * 60_000;
  const liveTarget = run?.target ?? target;
  const options = overview ? targetOptions(overview, liveTarget) : [];
  const selected = liveTarget
    ? liveTarget.assignmentId
      ? `a:${liveTarget.assignmentId}`
      : `c:${liveTarget.courseId}`
    : null;

  return (
    <TabScreen
      title="Focus"
      description="Work on one thing at a time. Paused time doesn't count."
      {...(primaryAction && !busy ? { primaryAction } : {})}
      loading={!overview}
      error={loadError}
      onRefresh={() => void load()}
    >
      {overview ? (
        <>
          <MetricGrid>
            <MetricCard
              label="Today's minutes"
              value={overview.today_minutes}
              detail={
                overview.today_minutes === 1 ? "minute focused today" : "minutes focused today"
              }
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

          {!hasCourses ? (
            <EmptyState
              icon="upload-file"
              title="Add a course to start focusing"
              body="Focus time is logged against a course, so the timer needs one first."
              action={{
                label: "Upload syllabus",
                onPress: () => {
                  router.push("/courses/upload");
                },
              }}
            />
          ) : (
            <View
              style={{
                gap: theme.spacing.card,
                padding: theme.spacing.section,
                borderRadius: theme.radii.card,
                backgroundColor: theme.colors.surfaceContainer,
                alignItems: "center",
              }}
            >
              <Text style={[theme.type.labelLarge, { color: theme.colors.onSurfaceVariant }]}>
                {phase === "running" ? "Focusing" : phase === "paused" ? "Paused" : "Ready"}
              </Text>
              {/* Not a live region: the time is never read out on its own. */}
              <Text
                accessibilityRole="timer"
                accessibilityLabel={clockInWords(left)}
                style={[
                  theme.type.timer,
                  { color: theme.colors.onSurface, fontVariant: ["tabular-nums"] },
                ]}
              >
                {formatClock(left)}
              </Text>
              {liveTarget ? (
                <View style={{ alignItems: "center", gap: theme.spacing.half }}>
                  <Text
                    style={[
                      theme.type.cardTitle,
                      { color: theme.colors.onSurface, textAlign: "center" },
                    ]}
                  >
                    {liveTarget.title}
                  </Text>
                  <View
                    style={{
                      flexDirection: "row",
                      flexWrap: "wrap",
                      gap: theme.spacing.related,
                      alignItems: "center",
                    }}
                  >
                    <CourseChip code={liveTarget.courseCode} colorHex={liveTarget.courseColor} />
                    {liveTarget.dueAt ? (
                      <Text style={[theme.type.body, { color: theme.colors.onSurfaceVariant }]}>
                        {dueText(liveTarget.dueAt, tz, now)}
                      </Text>
                    ) : null}
                  </View>
                </View>
              ) : (
                <Text style={[theme.type.body, { color: theme.colors.onSurfaceVariant }]}>
                  Not linked to a task yet
                </Text>
              )}
              {phase === "idle" ? null : (
                <Button
                  variant="tonal"
                  label="End session"
                  disabled={busy}
                  onPress={() => void end(true)}
                />
              )}
            </View>
          )}

          {error ? <Notice tone="error">{error}</Notice> : null}

          {phase === "idle" && breakState ? (
            <View
              accessibilityLabel="Break"
              style={{
                gap: theme.spacing.related,
                alignItems: "center",
                padding: theme.spacing.card,
                borderRadius: theme.radii.card,
                backgroundColor: theme.colors.secondaryContainer,
              }}
            >
              <Text
                style={[
                  theme.type.bodyLarge,
                  { color: theme.colors.onSecondaryContainer, textAlign: "center" },
                ]}
              >
                {"offer" in breakState
                  ? alertText.breakOffer(breakState.offer)
                  : `Break: ${formatClock(breakState.endsAt - now.getTime())} left`}
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.layout.targetGap }}>
                {"offer" in breakState ? (
                  <>
                    <Button
                      variant="tonal"
                      label="Start break"
                      onPress={() => {
                        const minutes = breakState.offer.minutes;
                        setNow(new Date());
                        setBreakState({ endsAt: Date.now() + minutes * 60_000, minutes });
                        announce(`Break started: ${String(minutes)} minutes.`);
                      }}
                    />
                    <Button
                      variant="text"
                      label="Skip break"
                      onPress={() => {
                        setBreakState(null);
                      }}
                    />
                  </>
                ) : (
                  <Button
                    variant="text"
                    label="End break"
                    onPress={() => {
                      setBreakState(null);
                      announce("Break ended.");
                    }}
                  />
                )}
              </View>
            </View>
          ) : null}

          {hasCourses ? (
            <View style={{ gap: theme.spacing.related }}>
              <SectionHeading>When the timer ends</SectionHeading>
              {(
                [
                  ["vibrate", "Vibrate"],
                  ["breaks", "Suggest breaks (5 minutes, 15 after every fourth session)"],
                ] as const
              ).map(([key, label]) => (
                <View
                  key={key}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: theme.spacing.card,
                    minHeight: theme.layout.minTarget,
                  }}
                >
                  <Text style={[theme.type.bodyLarge, { color: theme.colors.onSurface, flex: 1 }]}>
                    {label}
                  </Text>
                  <Switch
                    accessibilityLabel={label}
                    value={prefs[key]}
                    onValueChange={(v) => {
                      setPrefs({ ...prefs, [key]: v });
                    }}
                  />
                </View>
              ))}
            </View>
          ) : null}

          {hasCourses && phase === "idle" ? (
            <>
              <ChoiceChips
                label="Length"
                options={[...new Set([...LENGTH_OPTIONS, length])]
                  .sort((a, b) => a - b)
                  .map((m) => ({ value: m, label: formatMinutes(m) }))}
                value={length}
                onChange={setLength}
              />
              <View style={{ gap: theme.spacing.related }}>
                <SectionHeading>Working on</SectionHeading>
                <View accessibilityRole="radiogroup" accessibilityLabel="Working on">
                  <ListCard>
                    {options.map((o, i) => {
                      const checked = o.value === selected;
                      return (
                        <Pressable
                          key={o.value}
                          accessibilityRole="radio"
                          accessibilityState={{ checked }}
                          onPress={() => {
                            setTarget(o.target);
                            setError("");
                          }}
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: theme.spacing.related,
                            minHeight: 48,
                            paddingVertical: 12,
                            paddingHorizontal: theme.spacing.card,
                            borderTopWidth: i === 0 ? 0 : 1,
                            borderTopColor: theme.colors.outlineVariant,
                            backgroundColor: theme.colors.surfaceContainerLow,
                          }}
                        >
                          <Icon
                            name={checked ? "radio-button-checked" : "radio-button-unchecked"}
                            size={24}
                            color={checked ? theme.colors.primary : theme.colors.onSurfaceVariant}
                          />
                          <Text
                            style={[
                              theme.type.bodyLarge,
                              { color: theme.colors.onSurface, flex: 1 },
                            ]}
                          >
                            {o.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ListCard>
                </View>
              </View>
            </>
          ) : null}

          {overview.history.length ? (
            <View style={{ gap: theme.spacing.related }}>
              <SectionHeading>Recent sessions</SectionHeading>
              <ListCard label="Recent sessions">
                {overview.history.map((h, i) => (
                  <View
                    key={h.id}
                    accessible
                    style={{
                      gap: 2,
                      paddingVertical: 12,
                      paddingHorizontal: theme.spacing.card,
                      borderTopWidth: i === 0 ? 0 : 1,
                      borderTopColor: theme.colors.outlineVariant,
                      backgroundColor: theme.colors.surfaceContainerLow,
                    }}
                  >
                    <Text style={[theme.type.cardTitle, { color: theme.colors.onSurface }]}>
                      {h.title}
                    </Text>
                    <Text style={[theme.type.body, { color: theme.colors.onSurfaceVariant }]}>
                      {h.course_code ?? h.course_name} · {formatMinutes(h.minutes)} ·{" "}
                      {sessionWhen(h.started_at, h.ended_at, tz)}
                    </Text>
                  </View>
                ))}
              </ListCard>
            </View>
          ) : null}
        </>
      ) : null}
    </TabScreen>
  );
}
