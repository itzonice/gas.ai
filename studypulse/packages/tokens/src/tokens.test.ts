import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { buildCss } from "./css.ts";
import {
  coursePalette,
  courseColorFor,
  darkColors,
  layout,
  lightColors,
  nextCourseColor,
  radii,
  spacing,
} from "./index.ts";
import { darkTheme, lightTheme } from "./native.ts";

describe("scales", () => {
  it("follows the 8 px rhythm", () => {
    expect([spacing.related, spacing.card, spacing.section, spacing.major]).toEqual([
      8, 16, 24, 32,
    ]);
    expect([radii.control, radii.card, radii.sheet]).toEqual([8, 12, 16]);
    expect(layout.breakpoints).toEqual({ medium: 600, expanded: 1024, wide: 1440 });
    expect(layout.minTarget).toBe(48);
  });
});

describe("tokens.css", () => {
  it("is up to date with the tokens (run `pnpm --filter @studypulse/tokens generate`)", () => {
    const onDisk = readFileSync(new URL("../tokens.css", import.meta.url), "utf8");
    const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
    expect(normalize(onDisk)).toBe(
      normalize(buildCss({ light: lightColors, dark: darkColors, coursePalette })),
    );
  });

  it("defines dark mode for the media query and the data-theme override", () => {
    const css = buildCss({ light: lightColors, dark: darkColors, coursePalette });
    expect(css).toContain(`--sp-color-primary: ${lightColors.primary};`);
    expect(css).toContain("@media (prefers-color-scheme: dark)");
    expect(css).toContain(':root:not([data-theme="light"])');
    expect(css).toContain(':root[data-theme="dark"]');
    expect(css).toContain(`--sp-color-primary: ${darkColors.primary};`);
    expect(css).toContain("--sp-space-card: 16px;");
    expect(css).toContain("--sp-type-page-title-size: 2rem;");
  });
});

describe("course colors", () => {
  it("returns the palette entry for a stored hex, and the nearest one for others", () => {
    const blue = coursePalette.find((c) => c.key === "blue")!;
    expect(courseColorFor(blue.hex)).toBe(blue);
    expect(courseColorFor(blue.hex.toUpperCase())).toBe(blue);
    expect(courseColorFor("#E53935").key).toBe("red");
    expect(courseColorFor("#43A047").key).toBe("green");
    expect(courseColorFor(null).key).toBe(coursePalette[0]!.key);
    expect(courseColorFor("not-a-color").key).toBe(coursePalette[0]!.key);
  });

  it("suggests an unused color for a new course", () => {
    const first = nextCourseColor([]);
    expect(first).toBe(coursePalette[0]!.hex);
    expect(nextCourseColor([first])).toBe(coursePalette[1]!.hex);
    const all = coursePalette.map((c) => c.hex);
    expect(all).toContain(nextCourseColor(all));
  });
});

describe("native themes", () => {
  it("carry the same roles with RN-shaped type", () => {
    expect(lightTheme.colors.primary).toBe(lightColors.primary);
    expect(darkTheme.colors.surface).toBe(darkColors.surface);
    expect(darkTheme.dark).toBe(true);
    expect(lightTheme.type.pageTitle).toEqual({
      fontSize: 32,
      lineHeight: 40,
      fontWeight: "500",
      letterSpacing: 0,
    });
    expect(lightTheme.type.body.fontWeight).toBe("400");
    expect(Object.keys(lightTheme.course)).toHaveLength(coursePalette.length);
  });
});
