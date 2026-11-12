// A bottom sheet for short forms and prompts: a modal to screen readers, closed by the
// scrim, the back gesture, or its own buttons. It scrolls, so long text or 200% type
// never clips, and keeps a readable width on tablets.
import type { ReactNode } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useReduceMotion } from "../../lib/hooks";
import { useAppTheme } from "../../theme";

export function Sheet({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduceMotion ? "none" : "slide"}
      onRequestClose={onClose}
    >
      <Pressable
        accessibilityLabel="Close"
        onPress={onClose}
        style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.scrim, opacity: 0.32 }]}
      />
      <View
        accessibilityViewIsModal
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          maxHeight: "90%",
          backgroundColor: theme.colors.surfaceContainerLow,
          borderTopLeftRadius: theme.radii.sheet,
          borderTopRightRadius: theme.radii.sheet,
        }}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            padding: theme.spacing.section,
            paddingBottom: insets.bottom + theme.spacing.section,
            gap: theme.spacing.card,
            width: "100%",
            maxWidth: 640,
            alignSelf: "center",
          }}
        >
          <Text
            accessibilityRole="header"
            style={[theme.type.sectionHeading, { color: theme.colors.onSurface }]}
          >
            {title}
          </Text>
          {children}
        </ScrollView>
      </View>
    </Modal>
  );
}
