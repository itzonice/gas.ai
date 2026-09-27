import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import { useAppTheme } from "../../theme";
import { Icon } from "./Icon";

/**
 * An inline message: an error (read out right away) or a plain status line. Errors carry
 * an icon and words, never color alone, and can offer one action such as "Try again".
 */
export function Notice({
  tone = "info",
  children,
  action,
}: {
  tone?: "info" | "error";
  children: ReactNode;
  action?: { label: string; onPress: () => void };
}) {
  const theme = useAppTheme();
  const error = tone === "error";
  const fg = error ? theme.colors.onErrorContainer : theme.colors.onSurface;
  return (
    <View
      accessibilityRole={error ? "alert" : "text"}
      accessibilityLiveRegion={error ? "assertive" : "polite"}
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        alignItems: "center",
        gap: theme.spacing.related,
        padding: theme.spacing.card,
        borderRadius: theme.radii.card,
        backgroundColor: error ? theme.colors.errorContainer : theme.colors.surfaceContainer,
      }}
    >
      <Icon name={error ? "warning-amber" : "info-outline"} size={20} color={fg} />
      <Text style={[theme.type.body, { color: fg, flex: 1, minWidth: 160 }]}>{children}</Text>
      {action ? (
        <Pressable
          accessibilityRole="button"
          onPress={action.onPress}
          style={{
            minHeight: 48,
            justifyContent: "center",
            paddingHorizontal: theme.spacing.related,
          }}
        >
          <Text style={[theme.type.labelLarge, { color: error ? fg : theme.colors.primary }]}>
            {action.label}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
