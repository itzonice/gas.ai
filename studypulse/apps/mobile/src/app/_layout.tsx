import "../sentry";

import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { SessionProvider } from "../session";
import { AppThemeProvider, useAppTheme } from "../theme";

function Navigator() {
  const theme = useAppTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.surface },
        headerStyle: { backgroundColor: theme.colors.surface },
        headerTintColor: theme.colors.onSurface,
      }}
    >
      <Stack.Screen name="settings" options={{ headerShown: true, title: "Settings" }} />
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
