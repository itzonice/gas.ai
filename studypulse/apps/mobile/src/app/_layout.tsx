import "../sentry";

import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { useReduceMotion } from "../lib/hooks";
import { SessionProvider } from "../session";
import { AppThemeProvider, useAppTheme } from "../theme";

function Navigator() {
  const theme = useAppTheme();
  const reduceMotion = useReduceMotion();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        ...(reduceMotion ? { animation: "none" as const } : {}),
        contentStyle: { backgroundColor: theme.colors.surface },
        headerStyle: { backgroundColor: theme.colors.surface },
        headerTintColor: theme.colors.onSurface,
      }}
    >
      <Stack.Screen name="settings" options={{ headerShown: true, title: "Settings" }} />
      <Stack.Screen name="courses/[courseId]" options={{ headerShown: true, title: "Course" }} />
      <Stack.Screen name="courses/upload" options={{ headerShown: true, title: "Syllabus" }} />
      <Stack.Screen
        name="courses/review/[uploadId]"
        options={{ headerShown: true, title: "Review" }}
      />
      <Stack.Screen
        name="assignments/new"
        options={{ headerShown: true, title: "New assignment", presentation: "modal" }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppThemeProvider>
        <SessionProvider>
          <StatusBar style="auto" />
          <Navigator />
        </SessionProvider>
      </AppThemeProvider>
    </SafeAreaProvider>
  );
}
