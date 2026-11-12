import type { ReactNode } from "react";
import { Text, View } from "react-native";

import { useAppTheme } from "../../theme";
import { Icon } from "./Icon";

/** A labelled figure. Status is words plus an icon, never color alone. */
export function MetricCard({
  label,
  value,
  detail,
  status,
}: {
  label: string;
  value: string | number;
  detail?: ReactNode;
  status?: { tone: "error"; text: string };
}) {
  const theme = useAppTheme();
  return (
    <View
      accessible
      accessibilityLabel={[
        label,
        String(value),
        status?.text,
        typeof detail === "string" ? detail : null,
      ]
        .filter(Boolean)
        .join(", ")}
      style={{
        gap: theme.spacing.half,
        padding: theme.spacing.card,
        borderRadius: theme.radii.card,
        backgroundColor: theme.colors.surfaceContainer,
      }}
    >
      <Text style={[theme.type.labelLarge, { color: theme.colors.onSurfaceVariant }]}>{label}</Text>
      <Text
        style={[
          theme.type.pageTitle,
          { color: theme.colors.onSurface, fontVariant: ["tabular-nums"] },
        ]}
      >
        {value}
      </Text>
      {status ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.half }}>
          <Icon name="warning-amber" size={18} color={theme.colors.error} />
          <Text style={[theme.type.labelLarge, { color: theme.colors.error }]}>{status.text}</Text>
        </View>
      ) : null}
      {detail ? (
        <Text style={[theme.type.body, { color: theme.colors.onSurfaceVariant }]}>{detail}</Text>
      ) : null}
    </View>
  );
}
