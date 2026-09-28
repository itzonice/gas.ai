import { Pressable, Text } from "react-native";

import { useAppTheme } from "../../theme";

export type ButtonVariant = "filled" | "tonal" | "text" | "danger";

/** A 48 px button whose label is its accessible name. */
export function Button({
  label,
  onPress,
  variant = "filled",
  disabled = false,
  accessibilityHint,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  accessibilityHint?: string;
}) {
  const theme = useAppTheme();
  const c = theme.colors;
  const colors = {
    filled: [c.primary, c.onPrimary],
    tonal: [c.secondaryContainer, c.onSecondaryContainer],
    text: ["transparent", c.primary],
    danger: [c.error, c.onError],
  }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      {...(accessibilityHint ? { accessibilityHint } : {})}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: theme.layout.minTarget,
        paddingHorizontal: theme.spacing.section,
        justifyContent: "center",
        alignItems: "center",
        alignSelf: "flex-start",
        borderRadius: theme.radii.full,
        backgroundColor: colors[0],
        opacity: disabled ? 0.5 : pressed ? 0.88 : 1,
      })}
    >
      <Text style={[theme.type.labelLarge, { color: colors[1] }]}>{label}</Text>
    </Pressable>
  );
}
