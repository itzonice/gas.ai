import { AGE_MESSAGES, authErrorMessage, isOldEnough, toBirthMonth } from "@studypulse/core/auth";
import { TERMS_VERSION } from "@studypulse/core/legal";
import { Link } from "expo-router";
import { useEffect, useState } from "react";
import { Text } from "react-native";

import { BirthMonthFields, type BirthMonthValue } from "../../components/BirthMonthFields";
import { LegalLinks } from "../../components/LegalLinks";
import { Screen } from "../../components/Screen";
import { Button } from "../../components/ui/Button";
import { TextField } from "../../components/ui/TextField";
import { ageBlocked, recordAgeBlock } from "../../lib/age-block";
import { getSupabase } from "../../lib/supabase";
import { useAppTheme } from "../../theme";

export default function SignUpScreen() {
  const theme = useAppTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [birth, setBirth] = useState<BirthMonthValue>({ month: "", year: "" });
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    void ageBlocked().then(setBlocked);
  }, []);

  async function signUp() {
    setMessage("");
    // Age gate (S12): checked here and again on the server; under 13 never reaches it.
    const birthMonth = toBirthMonth(Number(birth.year), Number(birth.month));
    if (!birthMonth) {
      setMessage(AGE_MESSAGES.missing);
      return;
    }
    if (!isOldEnough(birthMonth)) {
      await recordAgeBlock();
      setBlocked(true);
      return;
    }
    setBusy(true);
    const { data, error } = await getSupabase().auth.signUp({
      email: email.trim(),
      password,
      options: { data: { birth_month: birthMonth, terms_version: TERMS_VERSION } },
    });
    setBusy(false);
    // With email confirmation on, there's no session yet; either way, the same words.
    if (error || !data.session) setMessage(authErrorMessage("sign-up", error));
  }

  if (blocked) {
    return (
      <Screen>
        <Text
          accessibilityRole="header"
          style={[theme.type.pageTitle, { color: theme.colors.onSurface }]}
        >
          You can&apos;t create an account
        </Text>
        <Text style={[theme.type.bodyLarge, { color: theme.colors.onSurface }]}>
          {AGE_MESSAGES.blocked}
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
        Create your account
      </Text>
      <TextField
        label="Email"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        value={email}
        onChangeText={setEmail}
      />
      <TextField
        label="Password"
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        value={password}
        onChangeText={setPassword}
      />
      <BirthMonthFields value={birth} onChange={setBirth} />
      <Text style={[theme.type.body, { color: theme.colors.onSurfaceVariant }]}>
        By creating an account you agree to the Terms of Use and Privacy Policy.
      </Text>
      <LegalLinks />
      {message ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[theme.type.body, { color: theme.colors.onSurface }]}
        >
          {message}
        </Text>
      ) : null}
      <Button
        label={busy ? "Creating…" : "Create account"}
        disabled={busy}
        onPress={() => void signUp()}
      />
      <Link
        href="/sign-in"
        style={[theme.type.labelLarge, { color: theme.colors.primary, minHeight: 48 }]}
      >
        I already have an account
      </Link>
    </Screen>
  );
}
