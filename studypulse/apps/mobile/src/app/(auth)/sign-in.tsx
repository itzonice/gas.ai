import { authErrorMessage } from "@studypulse/core/auth";
import { Link } from "expo-router";
import { useState } from "react";
import { Text } from "react-native";

import { LegalLinks } from "../../components/LegalLinks";
import { Screen } from "../../components/Screen";
import { Button } from "../../components/ui/Button";
import { TextField } from "../../components/ui/TextField";
import { getSupabase } from "../../lib/supabase";
import { useAppTheme } from "../../theme";

export default function SignInScreen() {
  const theme = useAppTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function signIn() {
    setBusy(true);
    setMessage("");
    const { error } = await getSupabase().auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    // On success the session listener moves on to Today.
    if (error) setMessage(authErrorMessage("sign-in", error));
  }

  return (
    <Screen>
      <Text
        accessibilityRole="header"
        style={[theme.type.pageTitle, { color: theme.colors.onSurface }]}
      >
        Sign in
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
        autoComplete="current-password"
        textContentType="password"
        value={password}
        onChangeText={setPassword}
      />
      {message ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[theme.type.body, { color: theme.colors.error }]}
        >
          {message}
        </Text>
      ) : null}
      <Button
        label={busy ? "Signing in…" : "Sign in"}
        disabled={busy}
        onPress={() => void signIn()}
      />
      <Link
        href="/reset-password"
        style={[theme.type.labelLarge, { color: theme.colors.primary, minHeight: 48 }]}
      >
        Forgot your password?
      </Link>
      <Link
        href="/sign-up"
        style={[theme.type.labelLarge, { color: theme.colors.primary, minHeight: 48 }]}
      >
        Create an account
      </Link>
      <LegalLinks />
    </Screen>
  );
}
