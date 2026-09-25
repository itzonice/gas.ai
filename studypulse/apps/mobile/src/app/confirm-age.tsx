// The age question for accounts made with Sign in with Apple or Google, which can't carry
// a birth month at sign-up (launch safety S12). Under 13, the server deletes the account
// and the app signs out.
import { AGE_MESSAGES, isOldEnough, toBirthMonth } from "@studypulse/core/auth";
import { router } from "expo-router";
import { useState } from "react";
import { Text } from "react-native";

import { BirthMonthFields, type BirthMonthValue } from "../components/BirthMonthFields";
import { LegalLinks } from "../components/LegalLinks";
import { Screen } from "../components/Screen";
import { Button } from "../components/ui/Button";
import { recordAgeBlock } from "../lib/age-block";
import { getApi, getSupabase } from "../lib/supabase";
import { useAppTheme } from "../theme";

export default function ConfirmAgeScreen() {
  const theme = useAppTheme();
  const [birth, setBirth] = useState<BirthMonthValue>({ month: "", year: "" });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);

  async function submit() {
    setMessage("");
    const birthMonth = toBirthMonth(Number(birth.year), Number(birth.month));
    if (!birthMonth) {
      setMessage(AGE_MESSAGES.missing);
      return;
    }
    setBusy(true);
    try {
      // Under 13 still goes to the server, which deletes the account.
      const result = await getApi().onboarding.confirmAge(birthMonth);
      if (result === "blocked" || !isOldEnough(birthMonth)) {
        await recordAgeBlock();
        setBlocked(true);
        await getSupabase()
          .auth.signOut({ scope: "local" })
          .catch(() => undefined);
        return;
      }
      router.replace("/today");
    } catch {
      setMessage("Couldn't save that. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (blocked) {
    return (
      <Screen>
        <Text
          accessibilityRole="header"
          style={[theme.type.pageTitle, { color: theme.colors.onSurface }]}
        >
          You can&apos;t use StudyPulse
        </Text>
        <Text style={[theme.type.bodyLarge, { color: theme.colors.onSurface }]}>
          {AGE_MESSAGES.blocked} Your account and anything in it have been deleted.
        </Text>
        <LegalLinks />
      </Screen>
    );
  }

  return (
    <Screen>
      <Text
        accessibilityRole="header"
        style={[theme.type.pageTitle, { color: theme.colors.onSurface }]}
      >
        One question first
      </Text>
      <BirthMonthFields value={birth} onChange={setBirth} />
      {message ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[theme.type.body, { color: theme.colors.onSurface }]}
        >
          {message}
        </Text>
      ) : null}
      <Button label={busy ? "Saving…" : "Continue"} disabled={busy} onPress={() => void submit()} />
    </Screen>
  );
}
