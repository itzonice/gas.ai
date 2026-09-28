import { Pressable, Text, View } from "react-native";

import { useAppTheme } from "../../theme";
import { Icon } from "./Icon";

/**
 * A single-choice group of 48 pt chips (a radio group to screen readers). The chosen chip
 * shows a check mark as well as its fill, so the choice isn't shown by color alone.
 */
export function ChoiceChips<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T | null;
  onChange: (value: T) => void;
}) {
  const theme = useAppTheme();
  return (
    <View style={{ gap: theme.spacing.half }}>
      <Text style={[theme.type.labelLarge, { color: theme.colors.onSurface }]}>{label}</Text>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={label}
        style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.layout.targetGap }}
      >
        {options.map((o) => {
          const selected = o.value === value;
          return (
            <Pressable
              key={String(o.value)}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              onPress={() => {
                onChange(o.value);
              }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: theme.spacing.half,
                minHeight: theme.layout.minTarget,
                paddingHorizontal: theme.spacing.card,
                borderRadius: theme.radii.control,
                borderWidth: 1,
                borderColor: selected ? theme.colors.secondaryContainer : theme.colors.outline,
                backgroundColor: selected ? theme.colors.secondaryContainer : "transparent",
              }}
            >
              {selected ? (
                <Icon name="check" size={18} color={theme.colors.onSecondaryContainer} />
              ) : null}
              <Text
                style={[
                  theme.type.labelLarge,
                  {
                    color: selected
                      ? theme.colors.onSecondaryContainer
                      : theme.colors.onSurfaceVariant,
                  },
                ]}
              >
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
