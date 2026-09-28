import { describe, expect, it } from "vitest";

import { colors, contrastRatio, coursePalette, MIN_CONTRAST, type ThemeName } from "./index.ts";

const themes: ThemeName[] = ["light", "dark"];

describe("contrastRatio", () => {
  it("matches known WCAG values", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    expect(contrastRatio("#767676", "#ffffff")).toBeCloseTo(4.54, 2);
  });
});

describe.each(themes)("%s theme color roles", (theme) => {
  const c = colors[theme];
  // Every "on" color is text on its container.
  const textPairs: [fg: keyof typeof c, bg: keyof typeof c][] = [
    ["onPrimary", "primary"],
    ["onPrimaryContainer", "primaryContainer"],
    ["onSecondary", "secondary"],
    ["onSecondaryContainer", "secondaryContainer"],
    ["onTertiaryContainer", "tertiaryContainer"],
    ["onError", "error"],
    ["onErrorContainer", "errorContainer"],
    ["inverseOnSurface", "inverseSurface"],
  ];
  it.each(textPairs)("%s on %s is readable text", (fg, bg) => {
    expect(contrastRatio(c[fg], c[bg])).toBeGreaterThanOrEqual(MIN_CONTRAST.text);
  });

  // Body text and metadata (due times, weights) on every surface the design uses.
  const surfaces = [
    "surface",
    "surfaceContainerLow",
    "surfaceContainer",
    "surfaceContainerHigh",
    "surfaceContainerHighest",
  ] as const;
  it.each(surfaces)("onSurface and onSurfaceVariant are readable on %s", (bg) => {
    expect(contrastRatio(c.onSurface, c[bg])).toBeGreaterThanOrEqual(MIN_CONTRAST.text);
    expect(contrastRatio(c.onSurfaceVariant, c[bg])).toBeGreaterThanOrEqual(MIN_CONTRAST.text);
  });

  it("primary and error work as text and graphics on the surface (buttons, 'Overdue')", () => {
    expect(contrastRatio(c.primary, c.surface)).toBeGreaterThanOrEqual(MIN_CONTRAST.text);
    expect(contrastRatio(c.error, c.surface)).toBeGreaterThanOrEqual(MIN_CONTRAST.text);
    expect(contrastRatio(c.error, c.surfaceContainer)).toBeGreaterThanOrEqual(MIN_CONTRAST.text);
  });

  it("the outline (focus ring, input borders) is a visible graphic", () => {
    expect(contrastRatio(c.outline, c.surface)).toBeGreaterThanOrEqual(MIN_CONTRAST.graphic);
  });
});

describe("course palette", () => {
  it("has distinct keys and hexes", () => {
    expect(new Set(coursePalette.map((c) => c.key)).size).toBe(coursePalette.length);
    expect(new Set(coursePalette.map((c) => c.hex)).size).toBe(coursePalette.length);
    expect(coursePalette.length).toBeGreaterThanOrEqual(8);
  });

  describe.each(themes)("%s theme", (theme) => {
    const c = colors[theme];
    it.each(coursePalette.map((p) => [p.key, p] as const))("%s passes", (_key, p) => {
      const s = p[theme];
      // The course code is text on the chip.
      expect(contrastRatio(s.onChip, s.chip)).toBeGreaterThanOrEqual(MIN_CONTRAST.text);
      // The stripe is an essential graphic next to cards and list rows.
      expect(contrastRatio(s.stripe, c.surface)).toBeGreaterThanOrEqual(MIN_CONTRAST.graphic);
      expect(contrastRatio(s.stripe, c.surfaceContainer)).toBeGreaterThanOrEqual(
        MIN_CONTRAST.graphic,
      );
    });
  });
});
