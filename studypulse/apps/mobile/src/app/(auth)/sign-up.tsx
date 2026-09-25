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

export default function SignUpScreen() {
  const theme = useAppTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function signUp() {
    setBusy(true);
    setMessage("");
    const { data, error } = await getSupabase().auth.signUp({ email: email.trim(), password });
    setBusy(false);
    // With email confirmation on, there's no session yet; either way, the same words.
    if (error || !data.session) setMessage(authErrorMessage("sign-up", error));
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
