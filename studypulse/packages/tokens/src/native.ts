// Theme objects for React Native / Expo. Same tokens as the CSS, in RN units
// (density-independent points) and RN style shapes (fontWeight as a string).
import { colors, coursePalette, layout, radii, spacing, typeScale } from "./index.ts";
import type { ColorRoles, CourseSwatch, ThemeName } from "./types.ts";

export interface NativeTextStyle {
  fontSize: number;
  lineHeight: number;
  fontWeight: "400" | "500";
  letterSpacing: number;
}

export interface NativeTheme {
  name: ThemeName;
  dark: boolean;
  colors: ColorRoles;
  course: Record<string, CourseSwatch>;
  spacing: typeof spacing;
  radii: typeof radii;
  layout: typeof layout;
  type: Record<keyof typeof typeScale, NativeTextStyle>;
}

const type = Object.fromEntries(
  Object.entries(typeScale).map(([k, t]) => [
    k,
    {
      fontSize: t.size,
      lineHeight: t.lineHeight,
      fontWeight: t.weight === 500 ? "500" : "400",
      letterSpacing: t.letterSpacing,
    },
  ]),
) as NativeTheme["type"];

function build(name: ThemeName): NativeTheme {
  return {
    name,
    dark: name === "dark",
    colors: colors[name],
    course: Object.fromEntries(coursePalette.map((c) => [c.key, c[name]])),
    spacing,
    radii,
    layout,
    type,
  };
}

export const lightTheme: NativeTheme = build("light");
export const darkTheme: NativeTheme = build("dark");
export const themes: Record<ThemeName, NativeTheme> = { light: lightTheme, dark: darkTheme };

export { courseColorFor, courseSwatch, nextCourseColor } from "./index.ts";
