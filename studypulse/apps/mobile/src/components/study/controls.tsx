// Small controls the study screens share: a checkbox row, a choice row, and a panel.
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import { useAppTheme } from "../../theme";
import { Icon } from "../ui";

/** A 48 pt checkbox row; the check mark and the words carry the state, not color alone. */
export function CheckRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  const theme = useAppTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={hint ? `${label}. ${hint}` : label}
      onPress={() => {
        onChange(!checked);
      }}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: theme.spacing.related,
        minHeight: theme.layout.minTarget,
      }}
    >
      <Icon
        name={checked ? "check-box" : "check-box-outline-blank"}
        size={24}
        color={checked ? theme.colors.primary : theme.colors.onSurfaceVariant}
      />
      <View style={{ flex: 1 }}>
        <Text style={[theme.type.bodyLarge, { color: theme.colors.onSurface }]}>{label}</Text>
        {hint ? (
          <Text style={[theme.type.label, { color: theme.colors.onSurfaceVariant }]}>{hint}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/** A card-colored container for one question, one summary, or one group of options. */
export function Panel({ children }: { children: ReactNode }) {
  const theme = useAppTheme();
  return (
    <View
      style={{
        gap: theme.spacing.card,
        padding: theme.spacing.card,
        borderRadius: theme.radii.card,
        backgroundColor: theme.colors.surfaceContainer,
      }}
    >
      {children}
    </View>
  );
}

/** An option the student picks: a radio (checked state) or a button (after answering). */
export function Choice({
  label,
  role = "radio",
  checked = false,
  disabled = false,
  tone,
  tag,
  onPress,
}: {
  label: string;
  role?: "radio" | "button";
  checked?: boolean;
  disabled?: boolean;
  /** After answering: the right option, or the student's wrong pick. */
  tone?: "right" | "wrong";
  /** Words that say why it's marked, such as "Correct answer". */
  tag?: string;
  onPress: () => void;
}) {
  const theme = useAppTheme();
  const c = theme.colors;
  const border = tone === "right" ? c.primary : tone === "wrong" ? c.error : c.outlineVariant;
  const bg =
    tone === "right" ? c.primaryContainer : tone === "wrong" ? c.errorContainer : c.surface;
  const fg =
    tone === "right" ? c.onPrimaryContainer : tone === "wrong" ? c.onErrorContainer : c.onSurface;
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={tag ? `${label}. ${tag}` : label}
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: theme.spacing.related,
        minHeight: theme.layout.minTarget,
        paddingVertical: theme.spacing.related,
        paddingHorizontal: theme.spacing.card,
        borderRadius: theme.radii.control,
        borderWidth: 2,
        borderColor: checked && !tone ? c.primary : border,
        backgroundColor: checked && !tone ? c.secondaryContainer : bg,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      {role === "radio" ? (
        <Icon
          name={checked ? "radio-button-checked" : "radio-button-unchecked"}
          size={22}
          color={checked ? c.primary : c.onSurfaceVariant}
        />
      ) : null}
      <Text style={[theme.type.bodyLarge, { color: fg, flex: 1 }]}>{label}</Text>
      {tag ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Icon name={tone === "right" ? "check" : "close"} size={18} color={fg} />
          <Text style={[theme.type.labelLarge, { color: fg }]}>{tag}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** A thin progress bar: read as a progress bar with its value, drawn as a fill. */
export function ProgressBar({ label, value, max }: { label: string; value: number; max: number }) {
  const theme = useAppTheme();
  const percent = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max, now: value }}
      style={{
        height: 8,
        borderRadius: theme.radii.full,
        backgroundColor: theme.colors.surfaceContainerHighest,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          height: 8,
          width: `${String(percent)}%` as `${number}%`,
          backgroundColor: theme.colors.primary,
        }}
      />
    </View>
  );
}
