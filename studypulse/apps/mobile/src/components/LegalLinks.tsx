// Terms of Use and Privacy Policy links (App Store guideline 3.1.2 wants them on the
// paywall and at signup; Settings has them too).
import { legalUrls } from "@studypulse/core/legal";
import { Linking, Pressable, Text, View } from "react-native";

import { env } from "../env";
import { useAppTheme } from "../theme";

export function LegalLinks() {
  const theme = useAppTheme();
  const urls = legalUrls(env.EXPO_PUBLIC_WEB_URL);
  const link = (label: string, url: string) => (
    <Pressable
      accessibilityRole="link"
      onPress={() => void Linking.openURL(url)}
      style={{ minHeight: theme.layout.minTarget, justifyContent: "center" }}
    >
      <Text
        style={[
          theme.type.labelLarge,
          { color: theme.colors.primary, textDecorationLine: "underline" },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.card }}>
      {link("Terms of Use", urls.terms)}
      {link("Privacy Policy", urls.privacy)}
    </View>
  );
}
