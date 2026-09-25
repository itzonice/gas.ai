import { Pressable, Text, View } from "react-native";

import { useAppTheme } from "../../theme";
import { Icon, type IconName } from "./Icon";

export function EmptyState({
  icon = "inbox",
  title,
  body,
  action,
}: {
  icon?: IconName;
  title: string;
  body?: string;
  action?: { label: string; onPress: () => void };
}) {
  const theme = useAppTheme();
  return (
    <View
      style={{
        alignItems: "center",
        gap: theme.spacing.related,
        paddingVertical: theme.spacing.major,
        paddingHorizontal: theme.spacing.card,
        borderRadius: theme.radii.card,
        backgroundColor: theme.colors.surfaceContainerLow,
      }}
    >
      <Icon name={icon} size={40} color={theme.colors.onSurfaceVariant} />
      <Text
        accessibilityRole="header"
        style={[theme.type.sectionHeading, { color: theme.colors.onSurface, textAlign: "center" }]}
      >
        {title}
      </Text>
      {body ? (
        <Text
          style={[theme.type.body, { color: theme.colors.onSurfaceVariant, textAlign: "center" }]}
        >
          {body}
        </Text>
      ) : null}
      {action ? (
        <Pressable
          accessibilityRole="button"
          onPress={action.onPress}
          style={({ pressed }) => ({
            minHeight: 48,
            paddingHorizontal: theme.spacing.section,
            justifyContent: "center",
            borderRadius: theme.radii.full,
            backgroundColor: theme.colors.secondaryContainer,
            opacity: pressed ? 0.88 : 1,
          })}
        >
          <Text style={[theme.type.labelLarge, { color: theme.colors.onSecondaryContainer }]}>
            {action.label}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
