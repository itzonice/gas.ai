import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import { useAppTheme } from "../../theme";
import { OverflowMenu, type MenuItem } from "./OverflowMenu";

/** A screen's one header, optional description, primary action, and overflow menu. */
export function PageHeader({
  title,
  description,
  primaryAction,
  secondaryActions,
}: {
  title: string;
  description?: ReactNode;
  primaryAction?: { label: string; onPress: () => void };
  secondaryActions?: readonly MenuItem[];
}) {
  const theme = useAppTheme();
  return (
    <View style={{ gap: theme.spacing.related }}>
      <Text
        accessibilityRole="header"
        style={[theme.type.pageTitle, { color: theme.colors.onSurface }]}
      >
        {title}
      </Text>
      {description ? (
        <Text style={[theme.type.bodyLarge, { color: theme.colors.onSurfaceVariant }]}>
          {description}
        </Text>
      ) : null}
      {primaryAction || secondaryActions?.length ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: theme.layout.targetGap }}>
          {primaryAction ? (
            <Pressable
              accessibilityRole="button"
              onPress={primaryAction.onPress}
              style={({ pressed }) => ({
                minHeight: 48,
                paddingHorizontal: theme.spacing.section,
                justifyContent: "center",
                borderRadius: theme.radii.full,
                backgroundColor: theme.colors.primary,
                opacity: pressed ? 0.88 : 1,
              })}
            >
              <Text style={[theme.type.labelLarge, { color: theme.colors.onPrimary }]}>
                {primaryAction.label}
              </Text>
            </Pressable>
          ) : null}
          {secondaryActions?.length ? (
            <OverflowMenu label="More actions" items={secondaryActions} />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
