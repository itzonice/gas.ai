import { courseSwatch } from "@studypulse/tokens/native";
import { Text } from "react-native";

import { useAppTheme } from "../../theme";

/**
 * The course's vetted tint with its code as text (never the color alone). The code wraps
 * rather than truncating, so it stays readable at large text sizes.
 */
export function CourseChip({ code, colorHex }: { code: string; colorHex?: string | null }) {
  const theme = useAppTheme();
  const swatch = courseSwatch(colorHex, theme.name);
  return (
    <Text
      style={[
        theme.type.label,
        {
          alignSelf: "flex-start",
          paddingHorizontal: theme.spacing.related,
          paddingVertical: 2,
          borderRadius: theme.radii.control,
          overflow: "hidden",
          backgroundColor: swatch.chip,
          color: swatch.onChip,
        },
      ]}
    >
      {code}
    </Text>
  );
}
