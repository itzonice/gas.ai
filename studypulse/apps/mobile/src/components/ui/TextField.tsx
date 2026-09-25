import { Text, TextInput, View, type TextInputProps } from "react-native";

import { useAppTheme } from "../../theme";

/** A labeled text input: the visible label is also the input's accessible name. */
export function TextField({
  label,
  error,
  ...props
}: { label: string; error?: string | null } & Omit<TextInputProps, "style">) {
  const theme = useAppTheme();
  return (
    <View style={{ gap: theme.spacing.half }}>
      <Text style={[theme.type.labelLarge, { color: theme.colors.onSurface }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        {...(error ? { accessibilityHint: error } : {})}
        placeholderTextColor={theme.colors.onSurfaceVariant}
        style={[
          theme.type.bodyLarge,
          {
            minHeight: theme.layout.minTarget,
            paddingHorizontal: theme.spacing.card,
            borderRadius: theme.radii.control,
            borderWidth: 1,
            borderColor: error ? theme.colors.error : theme.colors.outline,
            color: theme.colors.onSurface,
            backgroundColor: theme.colors.surface,
          },
        ]}
        {...props}
      />
      {error ? (
        <Text style={[theme.type.label, { color: theme.colors.error }]}>{error}</Text>
      ) : null}
    </View>
  );
}
