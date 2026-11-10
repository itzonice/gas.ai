// The five tabs, styled from the design tokens: bottom tabs on phones and a
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
  { name: "study", title: "Study", icon: "style" },
  { name: "focus", title: "Focus", icon: "timer" },
];

const TRACK = {
  ink: "#0c1730",
  night: "#050a19",
  text: "#c3cad7",
  active: "#f6f3ec",
  onActive: "#141b2e",
};

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
          // Phones: an ink-navy track in both themes with a paper pill for the current tab
          // (as on the website); the rail uses the theme roles.
          tabBarActiveTintColor: rail ? theme.colors.onSecondaryContainer : TRACK.active,
          tabBarInactiveTintColor: rail ? theme.colors.onSurfaceVariant : TRACK.text,
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
                backgroundColor: theme.dark ? TRACK.night : TRACK.ink,
                borderTopWidth: 0,
              },
          tabBarItemStyle: { minHeight: theme.layout.minTarget },
          tabBarLabelStyle: {
            fontSize: theme.type.label.fontSize,
            fontWeight: "700",
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
                    backgroundColor: focused
                      ? rail
                        ? theme.colors.secondaryContainer
                        : TRACK.active
                      : "transparent",
                  }}
                >
                  <Icon
                    name={tab.icon}
                    size={24}
                    color={focused && !rail ? TRACK.onActive : color}
                  />
                </View>
              ),
            }}
          />
        ))}
        {/* Stats is a screen of the tab group but not a tab: five tabs is the most a phone's
            bottom bar holds. It's reached from Today and Focus ("See your stats"). */}
        <Tabs.Screen name="stats" options={{ href: null, title: "Stats" }} />
      </Tabs>
      <FocusFab bottomOffset={barHeight} />
    </View>
  );
}
