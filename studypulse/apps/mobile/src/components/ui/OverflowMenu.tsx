// "More actions" on mobile: a 48 pt icon button that opens a bottom sheet of actions.
// Screen readers get a named button and a list of labelled menu items; Cancel and the
// scrim both close it, and the system back gesture does too (onRequestClose).
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAppTheme } from "../../theme";

export interface MenuItem {
  label: string;
  onSelect: () => void;
  destructive?: boolean;
}

export function OverflowMenu({ label, items }: { label: string; items: readonly MenuItem[] }) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const row = {
    minHeight: theme.layout.minTarget,
    paddingHorizontal: theme.spacing.section,
    justifyContent: "center" as const,
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ expanded: open }}
        onPress={() => {
          setOpen(true);
        }}
        style={styles.iconButton}
        hitSlop={4}
      >
        <MaterialIcons name="more-vert" size={24} color={theme.colors.onSurfaceVariant} />
      </Pressable>
      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setOpen(false);
        }}
      >
        <Pressable
          accessibilityLabel="Close menu"
          style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.scrim, opacity: 0.32 }]}
          onPress={() => {
            setOpen(false);
          }}
        />
        <View
          accessibilityRole="menu"
          accessibilityLabel={label}
          style={[
            styles.sheet,
            {
              backgroundColor: theme.colors.surfaceContainerLow,
              borderTopLeftRadius: theme.radii.sheet,
              borderTopRightRadius: theme.radii.sheet,
              paddingBottom: insets.bottom + theme.spacing.related,
            },
          ]}
        >
          {items.map((item) => (
            <Pressable
              key={item.label}
              accessibilityRole="menuitem"
              onPress={() => {
                setOpen(false);
                item.onSelect();
              }}
              style={({ pressed }) => [
                row,
                pressed && { backgroundColor: theme.colors.surfaceContainerHighest },
              ]}
            >
              <Text
                style={[
                  theme.type.bodyLarge,
                  { color: item.destructive ? theme.colors.error : theme.colors.onSurface },
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setOpen(false);
            }}
            style={[
              row,
              {
                borderTopWidth: StyleSheet.hairlineWidth,
                borderTopColor: theme.colors.outlineVariant,
              },
            ]}
          >
            <Text style={[theme.type.labelLarge, { color: theme.colors.primary }]}>Cancel</Text>
          </Pressable>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  iconButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  sheet: { position: "absolute", left: 0, right: 0, bottom: 0, paddingTop: 8 },
});
