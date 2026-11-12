import { Children, type ReactNode } from "react";
import { View } from "react-native";

import { useWindowClass } from "../../lib/hooks";
import { useAppTheme } from "../../theme";

/**
 * Metric cards: stacked on phones, two columns on tablets in portrait, and one row on
 * tablets in landscape. Cards grow with their text, so nothing clips at 200% text size.
 */
export function MetricGrid({ children }: { children: ReactNode }) {
  const theme = useAppTheme();
  const size = useWindowClass();
  const items = Children.toArray(children);
  const basis =
    size === "compact"
      ? "100%"
      : size === "medium"
        ? "47%"
        : `${Math.floor(94 / Math.max(items.length, 1))}%`;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.related }}>
      {items.map((child, i) => (
        <View key={i} style={{ flexGrow: 1, flexBasis: basis as `${number}%` }}>
          {child}
        </View>
      ))}
    </View>
  );
}
