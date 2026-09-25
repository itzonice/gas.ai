"use client";

// Onboarding for new accounts: name and timezone, daily study time, and reminders,
// then on to the first syllabus. Each step has one primary action; moving between steps
// puts focus on the new step's heading so screen readers hear where they are.
import { ApiError } from "@studypulse/core/api";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { markOnboarded } from "@/components/auth/RequireAuth";
import { useApi, useSession } from "@/components/auth/SessionProvider";
import { formatMinutes } from "@/components/today/model";
import { Button, Icon, SelectField, TextField } from "@/components/ui";
import { enableWebPush, webPushSupported } from "@/lib/web-push";

import styles from "./onboarding.module.css";
import { DAILY_MINUTES_OPTIONS, browserTimezone, timezoneOptions } from "./timezones";

const STEPS = ["About you", "Study time", "Reminders"] as const;

type PushState = "idle" | "working" | "on" | "declined" | "unavailable";

export function OnboardingScreen() {
  const api = useApi();
  const session = useSession();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [minutes, setMinutes] = useState(120);
  const [startTime, setStartTime] = useState("16:00");
  const [push, setPush] = useState<PushState>("idle");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only default
    setTimezone(browserTimezone());
    void api.features().then(
      (f) => {
        if (!f.webPush || !webPushSupported()) setPush("unavailable");
      },
      () => setPush("unavailable"),
    );
  }, [api]);

  useEffect(() => {
    if (moved.current) heading.current?.focus();
  }, [step]);

  function go(next: number) {
    moved.current = true;
    setError("");
    setStep(next);
  }

  function next(e: FormEvent) {
    e.preventDefault();
    if (step < STEPS.length - 1) go(step + 1);
  }

  async function turnOnPush() {
    setPush("working");
    try {
      setPush((await enableWebPush(api)) ? "on" : "declined");
    } catch {
      setPush("declined");
    }
  }

  async function finish(then: "/courses/upload" | "/today") {
    setSaving(true);
    setError("");
    try {
      await api.onboarding.complete({
        displayName: name,
        timezone,
        dailyStudyMinutes: minutes,
        studyStartTime: startTime,
      });
      if (session.status === "signed-in") markOnboarded(session.session.user.id);
      router.replace(then);
    } catch (e) {
      setSaving(false);
      setError(
        e instanceof ApiError && e.issues.length
          ? e.issues.map((i) => i.message).join(" ")
          : `Couldn't save: ${e instanceof Error ? e.message : "try again."}`,
      );
    }
  }

  return (
    <div className={styles.card}>
      <h1 className={styles.title}>Welcome to StudyPulse</h1>
      <p className={styles.lead}>Three quick questions, then add your first syllabus.</p>

      <ol className={styles.steps} aria-label="Progress">
        {STEPS.map((label, i) => (
          <li
            key={label}
            className={i === step ? styles.stepCurrent : i < step ? styles.stepDone : styles.step}
            {...(i === step ? { "aria-current": "step" as const } : {})}
          >
            {i < step ? <Icon name="check" size={16} /> : <span aria-hidden="true">{i + 1}</span>}
            {label}
            {i < step ? <span className="sp-visually-hidden"> (done)</span> : null}
          </li>
        ))}
      </ol>

      <form className={styles.form} onSubmit={next} noValidate>
        <h2 ref={heading} tabIndex={-1} className={styles.stepHeading}>
          Step {step + 1} of {STEPS.length}: {STEPS[step]}
        </h2>

        {step === 0 ? (
          <>
            <TextField
              label="What should we call you?"
              hint="Optional. Shown only to you."
              autoComplete="given-name"
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <SelectField
              label="Your timezone"
              hint="Due times, reminders, and your day follow this timezone."
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
            >
              {timezoneOptions(timezone).map((tz) => (
                <option key={tz} value={tz}>
                  {tz.replace(/_/g, " ")}
                </option>
              ))}
            </SelectField>
          </>
        ) : step === 1 ? (
          <>
            <SelectField
              label="How long can you study on a typical day?"
              hint="Your plan never schedules more than this. You can set different days later."
              value={String(minutes)}
              onChange={(e) => setMinutes(Number(e.target.value))}
            >
              {DAILY_MINUTES_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {formatMinutes(m)}
                </option>
              ))}
            </SelectField>
            <TextField
              label="When do you usually start?"
              hint="Study blocks are placed from this time on."
              type="time"
              step={900}
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </>
        ) : (
          <div className={styles.reminders}>
            <p>
              StudyPulse reminds you a day and two hours before things are due, counts down to
              exams, and stays quiet overnight (10 PM to 7 AM). You can change all of this in
              Settings.
            </p>
            {push === "unavailable" ? (
              <p className={styles.muted}>
                Reminders in this browser aren&apos;t available here. Install the StudyPulse app to
                get them on your phone.
              </p>
            ) : push === "on" ? (
              <p className={styles.success} role="status">
                <Icon name="check" size={20} /> Reminders are on in this browser.
              </p>
            ) : (
              <>
                <Button
                  variant="tonal"
                  icon="notifications"
                  disabled={push === "working"}
                  onClick={() => void turnOnPush()}
                >
                  Turn on reminders in this browser
                </Button>
                {push === "declined" ? (
                  <p className={styles.muted} role="status">
                    Reminders weren&apos;t turned on. You can allow them later in Settings or in
                    your browser&apos;s site settings.
                  </p>
                ) : null}
              </>
            )}
          </div>
        )}

        {error ? (
          <p role="alert" className={styles.alert}>
            <Icon name="warning" size={20} />
            {error}
          </p>
        ) : null}

        <div className={styles.actions}>
          {step > 0 ? (
            <Button variant="text" disabled={saving} onClick={() => go(step - 1)}>
              Back
            </Button>
          ) : (
            <span />
          )}
          {step < STEPS.length - 1 ? (
            <Button type="submit">Continue</Button>
          ) : (
            <div className={styles.finish}>
              <Button variant="text" disabled={saving} onClick={() => void finish("/today")}>
                Skip for now
              </Button>
              <Button
                icon="upload"
                disabled={saving}
                onClick={() => void finish("/courses/upload")}
              >
                Add your first syllabus
              </Button>
            </div>
          )}
        </div>
      </form>
    </div>
  );
}
