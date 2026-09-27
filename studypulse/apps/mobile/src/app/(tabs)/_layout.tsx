// The five destinations, styled from the design tokens: bottom tabs on phones and a
// navigation rail on tablets (600 pt and wider, portrait or landscape), plus the floating
// "Start focus" button. Tab changes don't animate when the system asks for less motion.
import { Redirect } from "expo-router";
import { Tabs } from "expo-router/tabs";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FocusFab } from "../../components/FocusFab";
import { Icon, type IconName } from "../../components/ui/Icon";
import { useReduceMotion, useWindowClass } from "../../lib/hooks";
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
  const rail = useWindowClass() !== "compact";
  const reduceMotion = useReduceMotion();
  const barHeight = rail ? insets.bottom : theme.layout.bottomBarHeight + insets.bottom;
  const userId = session.status === "signed-in" ? session.session.user.id : null;
  // Accounts from Sign in with Apple/Google answer the age question first (S12); new
  // accounts then go through onboarding, which saves the phone's timezone (L5).
  const [gate, setGate] = useState<{ user: string; next: "tabs" | "age" | "onboarding" } | null>(
    null,
  );
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const api = getApi();
    api.onboarding
      .ageConfirmed()
      .then(
        async (ok) => {
          if (!ok) return "age" as const;
          const needed = await api.onboarding.needed().catch(() => false);
          return needed ? ("onboarding" as const) : ("tabs" as const);
        },
        // The server refuses unconfirmed accounts anyway; don't lock anyone out on a blip.
        () => "tabs" as const,
      )
      .then((next) => {
        if (!cancelled) setGate({ user: userId, next });
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);
  if (session.status === "loading") return null;
  if (session.status === "signed-out") return <Redirect href="/sign-in" />;
  if (gate?.user !== userId) return null;
  if (gate.next === "age") return <Redirect href="/confirm-age" />;
  if (gate.next === "onboarding") return <Redirect href="/onboarding" />;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.surface }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          animation: reduceMotion ? "none" : "shift",
          sceneStyle: { backgroundColor: theme.colors.surface },
          tabBarPosition: rail ? "left" : "bottom",
          tabBarVariant: rail ? "material" : "uikit",
          tabBarLabelPosition: "below-icon",
          tabBarActiveTintColor: theme.colors.onSecondaryContainer,
          tabBarInactiveTintColor: theme.colors.onSurfaceVariant,
          tabBarStyle: rail
            ? {
                width: theme.layout.railWidth,
                paddingTop: insets.top + theme.spacing.section,
                backgroundColor: theme.colors.surfaceContainer,
                borderRightWidth: 0,
              }
            : {
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
