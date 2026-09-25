import "../sentry";

import { Slot } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AppThemeProvider } from "../theme";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppThemeProvider>
        <StatusBar style="auto" />
        <Slot />
      </AppThemeProvider>
    </SafeAreaProvider>
  );
}
