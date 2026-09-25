// Material icon glyphs, hidden from screen readers (the icon font's private-use
// characters would otherwise be read out). The control or text next to an icon carries
// the meaning; an icon-only button sets its own accessibilityLabel.
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import type { ComponentProps } from "react";
import type { ColorValue } from "react-native";

export type IconName = ComponentProps<typeof MaterialIcons>["name"];

export function Icon(props: { name: IconName; size: number; color: ColorValue }) {
  return (
    <MaterialIcons
      {...props}
      aria-hidden
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}
