// A scrolling screen body with safe-area padding, used by the account screens.
import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAppTheme } from "../theme";

export function Screen({ children, topInset = true }: { children: ReactNode; topInset?: boolean }) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.colors.surface }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingTop: (topInset ? insets.top : 0) + theme.spacing.section,
          paddingHorizontal: theme.spacing.card,
          paddingBottom: insets.bottom + theme.spacing.major,
          gap: theme.spacing.card,
        }}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
