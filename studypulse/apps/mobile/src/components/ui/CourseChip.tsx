import { courseSwatch } from "@studypulse/tokens/native";
import { Text } from "react-native";

import { useAppTheme } from "../../theme";

/** The course's vetted tint with its code as text (never the color alone). */
export function CourseChip({ code, colorHex }: { code: string; colorHex?: string | null }) {
  const theme = useAppTheme();
  const swatch = courseSwatch(colorHex, theme.name);
  return (
    <Text
      numberOfLines={1}
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
