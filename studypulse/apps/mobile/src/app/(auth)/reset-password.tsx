// Asks for a reset link; the link opens the web app to choose a new password. Same
// answer whether or not an account exists for the email (launch safety S6).
import { authErrorMessage } from "@studypulse/core/auth";
import { DEFAULT_WEB_ORIGIN } from "@studypulse/core/legal";
import { Link } from "expo-router";
import { useState } from "react";
import { Text } from "react-native";

import { Screen } from "../../components/Screen";
import { Button } from "../../components/ui/Button";
import { TextField } from "../../components/ui/TextField";
import { env } from "../../env";
import { getSupabase } from "../../lib/supabase";
import { useAppTheme } from "../../theme";

export default function ResetPasswordScreen() {
  const theme = useAppTheme();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    const origin = (env.EXPO_PUBLIC_WEB_URL ?? DEFAULT_WEB_ORIGIN).replace(/\/+$/, "");
    const { error } = await getSupabase().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${origin}/update-password`,
    });
    setBusy(false);
    setMessage(authErrorMessage("reset", error));
  }

  return (
    <Screen>
      <Text
        accessibilityRole="header"
        style={[theme.type.pageTitle, { color: theme.colors.onSurface }]}
      >
        Reset your password
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
      {message ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[theme.type.body, { color: theme.colors.onSurface }]}
        >
          {message}
        </Text>
      ) : null}
      <Button
        label={busy ? "Sending…" : "Send reset link"}
        disabled={busy}
        onPress={() => void send()}
      />
      <Link
        href="/sign-in"
        style={[theme.type.labelLarge, { color: theme.colors.primary, minHeight: 48 }]}
      >
        Back to sign in
      </Link>
    </Screen>
  );
}
