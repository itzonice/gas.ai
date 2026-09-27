// The frame for every signed-in screen: one header with the screen's single primary
// action and an overflow menu, a Settings button, pull to refresh, and the first-load
// and error states. Content keeps a readable width on tablets.
import { offlineMessage } from "@studypulse/core/screens";
import { Link } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { dismissRefused, useOffline } from "../lib/offline";
import { useAppTheme } from "../theme";
import { Icon } from "./ui/Icon";
import type { MenuItem } from "./ui/OverflowMenu";
import { Notice } from "./ui/Notice";
import { PageHeader } from "./ui/PageHeader";

export function TabScreen({
  title,
  description,
  primaryAction,
  secondaryActions,
  loading,
  error,
  refreshing = false,
  onRefresh,
  settings = true,
  topInset = true,
  bottomSpace = true,
  children,
}: {
  title: string;
  description?: ReactNode;
  primaryAction?: { label: string; onPress: () => void };
  secondaryActions?: readonly MenuItem[];
  /** True until the first load finishes; shows "Loading…" instead of the content. */
  loading?: boolean;
  error?: string | null;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** The Settings button (tabs only; pushed screens have a back button instead). */
  settings?: boolean;
  /** False under a native header, which already clears the status bar. */
  topInset?: boolean;
  /** Room at the bottom so the floating "Start focus" button never covers content. */
  bottomSpace?: boolean;
  children?: ReactNode;
}) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.surface }}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        paddingTop: (topInset ? insets.top : 0) + theme.spacing.section,
        paddingHorizontal: theme.spacing.card,
        paddingBottom: bottomSpace ? theme.spacing.major * 3 : insets.bottom + theme.spacing.major,
        gap: theme.spacing.section,
        width: "100%",
        maxWidth: theme.layout.contentMaxWidth,
        alignSelf: "center",
      }}
      {...(onRefresh
        ? {
            refreshControl: (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={theme.colors.primary}
                colors={[theme.colors.primary]}
                accessibilityLabel="Refresh"
              />
            ),
          }
        : {})}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: theme.spacing.related }}>
        <View style={{ flex: 1 }}>
          <PageHeader
            title={title}
            {...(description ? { description } : {})}
            {...(primaryAction ? { primaryAction } : {})}
            {...(secondaryActions?.length ? { secondaryActions } : {})}
          />
        </View>
        {settings ? (
          <Link href="/settings" asChild>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Settings"
              style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center" }}
            >
              <Icon name="settings" size={24} color={theme.colors.onSurfaceVariant} />
            </Pressable>
          </Link>
        ) : null}
      </View>
      <OfflineBanner />
      {error ? (
        <Notice
          tone="error"
          {...(onRefresh ? { action: { label: "Try again", onPress: onRefresh } } : {})}
        >
          {error}
        </Notice>
      ) : null}
      {loading && !error ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[theme.type.bodyLarge, { color: theme.colors.onSurfaceVariant }]}
        >
          Loading…
        </Text>
      ) : null}
      {loading ? null : children}
    </ScrollView>
  );
}

/** A section heading, read as a header by screen readers. */
export function SectionHeading({ children }: { children: string }) {
  const theme = useAppTheme();
  return (
    <Text
      accessibilityRole="header"
      style={[theme.type.sectionHeading, { color: theme.colors.onSurface }]}
    >
      {children}
    </Text>
  );
}

/** A plain list container: rows separated by dividers, rounded as one card. */
export function ListCard({ children, label }: { children: ReactNode; label?: string }) {
  const theme = useAppTheme();
  return (
    <View
      accessibilityRole="list"
      {...(label ? { accessibilityLabel: label } : {})}
      style={{ borderRadius: theme.radii.card, overflow: "hidden" }}
    >
      {children}
    </View>
  );
}

/**
 * "You're offline. Showing what was saved at 3:05 PM. 2 changes will sync…" while there
 * is no connection or changes are waiting (L2), and a note if a queued change was refused.
 */
function OfflineBanner() {
  const state = useOffline();
  if (state.refused) {
    return (
      <Notice tone="error" action={{ label: "OK", onPress: dismissRefused }}>
        {state.refused}
      </Notice>
    );
  }
  if (!state.offline && state.pending === 0) return null;
  return (
    <Notice>
      {state.offline
        ? offlineMessage(state)
        : `Syncing ${String(state.pending)} ${state.pending === 1 ? "change" : "changes"}…`}
    </Notice>
  );
}
