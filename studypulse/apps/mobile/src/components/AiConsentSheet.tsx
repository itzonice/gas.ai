// Launch audit L2-AI on mobile. Before anything goes to the AI provider, the student
// sees who it is, what is sent, and why, and taps "Allow and continue" (App Store
// 5.1.2(i), Google Play user data policy). The text is AI_DISCLOSURE, the same as the web
// and the privacy policy. The database refuses AI requests without consent, so this
// prompt is the friendly path, not the enforcement.
import { AI_DISCLOSURE as AI } from "@studypulse/core/privacy";
import { useState } from "react";
import { Linking, Text, View } from "react-native";

import { errorMessage } from "../lib/errors";
import { getApi } from "../lib/supabase";
import { useAppTheme } from "../theme";
import { Button } from "./ui/Button";
import { Notice } from "./ui/Notice";
import { Sheet } from "./ui/Sheet";

export function AiConsentSheet({
  visible,
  onClose,
  onAllowed,
}: {
  visible: boolean;
  /** "Not now", the back gesture, or the scrim: nothing is sent. */
  onClose: () => void;
  /** Runs after the consent is saved on the server. */
  onAllowed: () => void;
}) {
  const theme = useAppTheme();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function allow() {
    setSaving(true);
    setError(null);
    try {
      await getApi().privacy.setAiConsent(true, "prompt");
      onAllowed();
    } catch (e) {
      setError(errorMessage(e, "Couldn't save your choice. Try again."));
    } finally {
      setSaving(false);
    }
  }

  const p = [theme.type.body, { color: theme.colors.onSurface }];
  return (
    <Sheet visible={visible} title={AI.title} onClose={onClose}>
      <Text style={p}>{AI.purpose}</Text>
      <Text style={[theme.type.labelLarge, { color: theme.colors.onSurface }]}>
        What is sent to {AI.provider}:
      </Text>
      {AI.sent.map((item) => (
        <Text key={item} style={p}>
          {"\u2022 "}
          {item}
        </Text>
      ))}
      <Text style={p}>{AI.notSent}</Text>
      <Text style={p}>{AI.use}</Text>
      <Button
        variant="text"
        label={`${AI.provider}'s privacy policy`}
        accessibilityHint="Opens in your browser"
        onPress={() => {
          void Linking.openURL(AI.providerUrl);
        }}
      />
      <Text style={p}>{AI.accuracy}</Text>
      <Text style={p}>{AI.choice}</Text>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: theme.layout.targetGap,
          justifyContent: "flex-end",
        }}
      >
        <Button variant="text" label={AI.decline} onPress={onClose} />
        <Button
          label={saving ? "Saving…" : AI.allow}
          disabled={saving}
          onPress={() => void allow()}
        />
      </View>
    </Sheet>
  );
}

/** Whether AI features are allowed for this account right now (read from the server). */
export async function aiAllowed(): Promise<boolean> {
  const settings = await getApi().settings.get();
  return settings.profile.ai_processing_allowed;
}
