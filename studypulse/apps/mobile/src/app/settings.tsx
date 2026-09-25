// Settings on mobile: account, subscription, legal links, sign out, and account deletion
// (App Store guideline 5.1.1(v): deletion must be in the app). Delete account is one
// tap from here, then one confirmation.
import { ApiError } from "@studypulse/core/api";
import { DEFAULT_WEB_ORIGIN, STORE_SUBSCRIPTION_URLS } from "@studypulse/core/legal";
import { router } from "expo-router";
import { useState } from "react";
import { Alert, Linking, Platform, Text, View } from "react-native";

import { LegalLinks } from "../components/LegalLinks";
import { Screen } from "../components/Screen";
import { Button } from "../components/ui/Button";
import { env } from "../env";
import { getApi, getSupabase } from "../lib/supabase";
import { resetPurchaser } from "../purchases";
import { useSession } from "../session";
import { useAppTheme } from "../theme";

/** Signs out everywhere: revokes every refresh token for this account, then clears this device. */
export async function signOutEverywhere() {
  await resetPurchaser().catch(() => undefined);
  const auth = getSupabase().auth;
  const { error } = await auth.signOut({ scope: "global" });
  // Offline or already revoked: still forget the session on this device.
  if (error) await auth.signOut({ scope: "local" });
}

export default function SettingsScreen() {
  const theme = useAppTheme();
  const session = useSession();
  const [busy, setBusy] = useState(false);
  const email = session.status === "signed-in" ? session.session.user.email : undefined;

  const heading = (text: string) => (
    <Text
      accessibilityRole="header"
      style={[theme.type.sectionHeading, { color: theme.colors.onSurface }]}
    >
      {text}
    </Text>
  );

  async function manageSubscription() {
    // A store purchase can only be changed in that store; web purchases in the Stripe portal.
    const status = await getApi()
      .billing.status()
      .catch(() => null);
    const where = status?.manage_in;
    if (where === "stripe_portal") {
      await Linking.openURL(
        `${(env.EXPO_PUBLIC_WEB_URL ?? DEFAULT_WEB_ORIGIN).replace(/\/+$/, "")}/settings#plan`,
      );
      return;
    }
    const url =
      where === "play_store" || (!where && Platform.OS === "android")
        ? STORE_SUBSCRIPTION_URLS.play_store
        : STORE_SUBSCRIPTION_URLS.app_store;
    await Linking.openURL(url);
  }

  async function deleteAccount() {
    setBusy(true);
    try {
      await getApi().account.delete("DELETE");
      await getSupabase()
        .auth.signOut({ scope: "local" })
        .catch(() => undefined);
      router.replace("/sign-in");
    } catch (error) {
      setBusy(false);
      Alert.alert(
        "Account not deleted",
        error instanceof ApiError && error.status === 503
          ? "Your subscription can't be cancelled right now, so nothing was deleted. Try again later."
          : "Something went wrong and nothing was deleted. Try again.",
      );
    }
  }

  function confirmDelete() {
    Alert.alert(
      "Delete your account?",
      "This permanently deletes your courses, grades, study history, and files. It can't be undone. A subscription bought in the App Store or Google Play must be cancelled there.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete account", style: "destructive", onPress: () => void deleteAccount() },
      ],
    );
  }

  return (
    <Screen topInset={false}>
      <View style={{ gap: theme.spacing.related }}>
        {heading("Account")}
        <Text style={[theme.type.body, { color: theme.colors.onSurfaceVariant }]}>
          Signed in as {email ?? "your account"}
        </Text>
        <Button label="Sign out" variant="tonal" onPress={() => void signOutEverywhere()} />
      </View>
      <View style={{ gap: theme.spacing.related }}>
        {heading("Subscription")}
        <Button
          label="Manage or cancel subscription"
          variant="tonal"
          onPress={() => void manageSubscription()}
        />
      </View>
      <View style={{ gap: theme.spacing.related }}>
        {heading("Legal")}
        <LegalLinks />
      </View>
      <View style={{ gap: theme.spacing.related }}>
        {heading("Delete account")}
        <Text style={[theme.type.body, { color: theme.colors.onSurfaceVariant }]}>
          Permanently deletes your account and everything in it.
        </Text>
        <Button
          label={busy ? "Deleting…" : "Delete account"}
          variant="danger"
          disabled={busy}
          onPress={confirmDelete}
        />
      </View>
    </Screen>
  );
}
