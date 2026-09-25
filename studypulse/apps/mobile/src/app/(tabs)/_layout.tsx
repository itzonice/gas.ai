// Bottom tabs for the five destinations, styled from the design tokens, plus the
// floating "Start focus" button above the tab bar.
import { Redirect } from "expo-router";
import { Tabs } from "expo-router/tabs";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FocusFab } from "../../components/FocusFab";
import { Icon, type IconName } from "../../components/ui/Icon";
import { getApi } from "../../lib/supabase";
import { useSession } from "../../session";
import { useAppTheme } from "../../theme";

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
  const userId = session.status === "signed-in" ? session.session.user.id : null;
  // Accounts from Sign in with Apple/Google answer the age question first (S12).
  const [ageChecked, setAgeChecked] = useState<{ user: string; ok: boolean } | null>(null);
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    getApi()
      .onboarding.ageConfirmed()
      .then(
        (ok) => {
          if (!cancelled) setAgeChecked({ user: userId, ok });
        },
        // The server refuses unconfirmed accounts anyway; don't lock anyone out on a blip.
        () => {
          if (!cancelled) setAgeChecked({ user: userId, ok: true });
        },
      );
    return () => {
      cancelled = true;
    };
  }, [userId]);
  if (session.status === "loading") return null;
  if (session.status === "signed-out") return <Redirect href="/sign-in" />;
  if (ageChecked?.user !== userId) return null;
  if (!ageChecked.ok) return <Redirect href="/confirm-age" />;

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
                  <Icon name={tab.icon} size={24} color={color} />
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
