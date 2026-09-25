// StudyPulse design tokens: Material 3 color roles (light and dark from one seed), the
// vetted course palette, 8 px spacing, radii, the type scale, and layout breakpoints.
// Web: import "@studypulse/tokens/css" for CSS variables. Expo: "@studypulse/tokens/native".
import { contrastRatio, parseHex } from "./contrast.ts";
import { coursePalette, darkColors, lightColors, SEED_COLOR } from "./generated.ts";
import type { ColorRoles, CourseColor, CourseSwatch, ThemeName } from "./types.ts";

export * from "./contrast.ts";
export * from "./tokens.ts";
export type * from "./types.ts";
export { coursePalette, darkColors, lightColors, SEED_COLOR };

export const colors: Record<ThemeName, ColorRoles> = { light: lightColors, dark: darkColors };

function hue(hex: string): number {
  const [r, g, b] = parseHex(hex).map((c) => c / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

/**
 * The vetted palette entry for a stored course color. Exact matches return that entry;
 * any other hex (older data, imports) maps to the nearest hue, so every course renders
 * with colors that pass contrast in both themes.
 */
export function courseColorFor(hex: string | null | undefined): CourseColor {
  const fallback = coursePalette[0];
  if (!fallback) throw new Error("course palette is empty");
  if (!hex) return fallback;
  let parsed: string;
  try {
    parseHex(hex);
    parsed = hex.toLowerCase();
  } catch {
    return fallback;
  }
  const exact = coursePalette.find((c) => c.hex.toLowerCase() === parsed);
  if (exact) return exact;
  const h = hue(parsed);
  let best = fallback;
  let bestDistance = Infinity;
  for (const c of coursePalette) {
    const d = Math.abs(hue(c.hex) - h);
    const distance = Math.min(d, 360 - d);
    if (distance < bestDistance) {
      best = c;
      bestDistance = distance;
    }
  }
  return best;
}

export function courseSwatch(hex: string | null | undefined, theme: ThemeName): CourseSwatch {
  return courseColorFor(hex)[theme];
}

/** Picks the next palette color for a new course, avoiding ones the user already uses. */
export function nextCourseColor(usedHexes: readonly string[]): string {
  const used = new Set(usedHexes.map((h) => courseColorFor(h).key));
  const free =
    coursePalette.find((c) => !used.has(c.key)) ??
    coursePalette[usedHexes.length % coursePalette.length];
  return (free ?? coursePalette[0])?.hex ?? "#000000";
}

/** Whether text in `fg` is readable on `bg` (4.5:1, or 3:1 for large text). */
export const isReadable = (fg: string, bg: string, large = false) =>
  contrastRatio(fg, bg) >= (large ? 3 : 4.5);
