// Bottom tabs for the five destinations, styled from the design tokens, plus the
// floating "Start focus" button above the tab bar.
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Redirect } from "expo-router";
import { Tabs } from "expo-router/tabs";
import type { ComponentProps } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FocusFab } from "../../components/FocusFab";
import { useSession } from "../../session";
import { useAppTheme } from "../../theme";

type IconName = ComponentProps<typeof MaterialIcons>["name"];

const TABS: { name: string; title: string; icon: IconName }[] = [
  { name: "today", title: "Today", icon: "today" },
  { name: "calendar", title: "Calendar", icon: "calendar-month" },
  { name: "courses", title: "Courses", icon: "school" },
  { name: "focus", title: "Focus", icon: "timer" },
  { name: "stats", title: "Stats", icon: "bar-chart" },
];

export default function TabsLayout() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const session = useSession();
  const barHeight = theme.layout.bottomBarHeight + insets.bottom;
  if (session.status === "loading") return null;
  if (session.status === "signed-out") return <Redirect href="/sign-in" />;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.surface }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: theme.colors.surface },
          tabBarActiveTintColor: theme.colors.onSecondaryContainer,
          tabBarInactiveTintColor: theme.colors.onSurfaceVariant,
          tabBarStyle: {
            minHeight: barHeight,
            paddingTop: theme.spacing.related,
            backgroundColor: theme.colors.surfaceContainer,
            borderTopWidth: 0,
          },
          tabBarItemStyle: { minHeight: theme.layout.minTarget },
          tabBarLabelStyle: {
            fontSize: theme.type.label.fontSize,
            fontWeight: theme.type.label.fontWeight,
          },
        }}
      >
        {TABS.map((tab) => (
          <Tabs.Screen
            key={tab.name}
            name={tab.name}
            options={{
              title: tab.title,
              tabBarAccessibilityLabel: tab.title,
              tabBarIcon: ({ color, focused }) => (
                // M3 active indicator: a pill behind the icon (shape, not only color).
                <View
                  style={{
                    width: 64,
                    height: 32,
                    borderRadius: theme.radii.full,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: focused ? theme.colors.secondaryContainer : "transparent",
                  }}
                >
                  <MaterialIcons name={tab.icon} size={24} color={color} />
                </View>
              ),
            }}
          />
        ))}
      </Tabs>
      <FocusFab bottomOffset={barHeight} />
    </View>
  );
}
