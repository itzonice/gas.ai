// Temporary screen body until each screen is built (prompts 80–86): one heading and a
// one-line description, per the design system.
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Link } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
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
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text
          accessibilityRole="header"
          style={[theme.type.pageTitle, { color: theme.colors.onSurface, flexShrink: 1 }]}
        >
          {title}
        </Text>
        <Link href="/settings" asChild>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Settings"
            style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center" }}
          >
            <MaterialIcons name="settings" size={24} color={theme.colors.onSurfaceVariant} />
          </Pressable>
        </Link>
      </View>
      <Text style={[theme.type.bodyLarge, { color: theme.colors.onSurfaceVariant }]}>
        {description}
      </Text>
    </ScrollView>
  );
}
