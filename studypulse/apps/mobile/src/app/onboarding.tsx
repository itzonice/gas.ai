// First run on mobile (launch audit L5): what to call you, and how much and when you
// study, with the phone's timezone saved so "today", due times, and reminders are local.
// Every step has Skip, which keeps the defaults; the timezone is saved either way.
import {
  clockLabel,
  formatMinutes,
  DAILY_MINUTES_OPTIONS,
  DEFAULT_DAILY_MINUTES,
  DEFAULT_STUDY_START,
  STUDY_START_OPTIONS,
} from "@studypulse/core/screens";
import { router } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";

import { Screen } from "../components/Screen";
import { Button, ChoiceChips, Notice, TextField } from "../components/ui";
import { errorMessage } from "../lib/errors";
import { announce } from "../lib/hooks";
import { getApi } from "../lib/supabase";
import { useAppTheme } from "../theme";

const STEPS = ["About you", "Study time"] as const;

function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export default function OnboardingScreen() {
  const theme = useAppTheme();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [minutes, setMinutes] = useState<number>(DEFAULT_DAILY_MINUTES);
  const [start, setStart] = useState<string>(DEFAULT_STUDY_START);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const timezone = deviceTimezone();

  function go(next: number) {
    setError(null);
    setStep(next);
    announce(`Step ${String(next + 1)} of ${String(STEPS.length)}: ${STEPS[next] ?? ""}`);
  }

  async function finish(then: "/today" | "/courses/upload") {
    setSaving(true);
    setError(null);
    try {
      await getApi().onboarding.complete({
        displayName: name.trim(),
        timezone,
        dailyStudyMinutes: minutes,
        studyStartTime: start,
      });
      router.replace(then);
    } catch (e) {
      setSaving(false);
      setError(errorMessage(e, "Couldn't save. Try again."));
    }
  }

  const last = step === STEPS.length - 1;
  return (
    <Screen>
      <Text
        accessibilityRole="header"
        style={[theme.type.pageTitle, { color: theme.colors.onSurface }]}
      >
        Welcome to StudyPulse
      </Text>
      <Text style={[theme.type.labelLarge, { color: theme.colors.onSurfaceVariant }]}>
        Step {step + 1} of {STEPS.length}: {STEPS[step]}
      </Text>

      {step === 0 ? (
        <>
          <TextField
            label="What should we call you?"
            hint="Optional. Shown only to you."
            value={name}
            onChangeText={setName}
            autoComplete="given-name"
            textContentType="givenName"
            maxLength={100}
          />
          <Text style={[theme.type.body, { color: theme.colors.onSurfaceVariant }]}>
            Due dates and reminders use your phone&apos;s time zone ({timezone}). You can change it
            in Settings on the web.
          </Text>
        </>
      ) : (
        <>
          <ChoiceChips
            label="How long can you study on a typical day?"
            options={DAILY_MINUTES_OPTIONS.map((m) => ({ value: m, label: formatMinutes(m) }))}
            value={minutes}
            onChange={setMinutes}
          />
          <ChoiceChips
            label="When do you usually start?"
            options={STUDY_START_OPTIONS.map((t) => ({ value: t, label: clockLabel(t) }))}
            value={start}
            onChange={setStart}
          />
        </>
      )}

      {error ? <Notice tone="error">{error}</Notice> : null}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.layout.targetGap }}>
        {last ? (
          <>
            <Button
              label={saving ? "Saving…" : "Add your first syllabus"}
              disabled={saving}
              onPress={() => void finish("/courses/upload")}
            />
            <Button
              variant="text"
              label="Skip for now"
              disabled={saving}
              onPress={() => void finish("/today")}
            />
          </>
        ) : (
          <>
            <Button
              label="Continue"
              onPress={() => {
                go(step + 1);
              }}
            />
            <Button
              variant="text"
              label="Skip"
              accessibilityHint="Keeps the defaults for this step"
              onPress={() => {
                go(step + 1);
              }}
            />
          </>
        )}
        {step > 0 ? (
          <Button
            variant="text"
            label="Back"
            disabled={saving}
            onPress={() => {
              go(step - 1);
            }}
          />
        ) : null}
      </View>
    </Screen>
  );
}
