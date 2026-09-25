// "Start focus" floating button: always one tap away above the tab bar (hidden on the
// Focus tab itself, where the timer's own controls take over).
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router, usePathname } from "expo-router";
import { Pressable, StyleSheet, Text } from "react-native";

import { useAppTheme } from "../theme";

export function FocusFab({ bottomOffset }: { bottomOffset: number }) {
  const theme = useAppTheme();
  const pathname = usePathname();
  if (pathname.startsWith("/focus")) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Start focus session"
      onPress={() => {
        router.push({ pathname: "/focus", params: { start: "1" } });
      }}
      style={({ pressed }) => [
        styles.fab,
        {
          bottom: bottomOffset + theme.spacing.card,
          right: theme.spacing.card,
          backgroundColor: theme.colors.primary,
          borderRadius: theme.radii.card,
          opacity: pressed ? 0.88 : 1,
        },
      ]}
    >
      <MaterialIcons name="play-arrow" size={24} color={theme.colors.onPrimary} />
      <Text style={[theme.type.labelLarge, { color: theme.colors.onPrimary }]}>Start focus</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 56,
    paddingHorizontal: 20,
    paddingVertical: 16,
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
});
