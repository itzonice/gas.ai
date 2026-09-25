// Temporary screen body until each screen is built (prompts 80–86): one heading and a
// one-line description, per the design system.
import { ScrollView, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAppTheme } from "../theme";

export function ScreenPlaceholder({ title, description }: { title: string; description: string }) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ backgroundColor: theme.colors.surface }}
      contentContainerStyle={{
        paddingTop: insets.top + theme.spacing.section,
        paddingHorizontal: theme.spacing.card,
        paddingBottom: theme.spacing.major * 3,
        gap: theme.spacing.related,
      }}
    >
      <Text
        accessibilityRole="header"
        style={[theme.type.pageTitle, { color: theme.colors.onSurface }]}
      >
        {title}
      </Text>
      <Text style={[theme.type.bodyLarge, { color: theme.colors.onSurfaceVariant }]}>
        {description}
      </Text>
    </ScrollView>
  );
}
