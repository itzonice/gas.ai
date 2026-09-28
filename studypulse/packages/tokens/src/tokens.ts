// Non-color design tokens: the 8 px spacing rhythm, corner radii, the type scale, and
// layout breakpoints. Values are in px (CSS) and density-independent points (React Native).

export const spacing = {
  /** Half step, only inside components (icon to label). */
  half: 4,
  /** Between related items. */
  related: 8,
  /** Card padding. */
  card: 16,
  /** Between sections. */
  section: 24,
  /** Major separation. */
  major: 32,
} as const;

export const radii = {
  control: 8,
  card: 12,
  sheet: 16,
  full: 9999,
} as const;

export const fontFamily = {
  sans: 'Roboto, system-ui, -apple-system, "Segoe UI", "Helvetica Neue", Arial, sans-serif',
  mono: 'ui-monospace, "SF Mono", "Roboto Mono", Menlo, monospace',
} as const;

/** Medium for headings, regular for body. */
export const fontWeight = { regular: 400, medium: 500 } as const;

export interface TypeStyle {
  size: number;
  lineHeight: number;
  weight: number;
  letterSpacing: number;
}

export const typeScale = {
  pageTitle: { size: 32, lineHeight: 40, weight: fontWeight.medium, letterSpacing: 0 },
  sectionHeading: { size: 22, lineHeight: 28, weight: fontWeight.medium, letterSpacing: 0 },
  cardTitle: { size: 16, lineHeight: 24, weight: fontWeight.medium, letterSpacing: 0.15 },
  bodyLarge: { size: 16, lineHeight: 24, weight: fontWeight.regular, letterSpacing: 0.5 },
  body: { size: 14, lineHeight: 20, weight: fontWeight.regular, letterSpacing: 0.25 },
  labelLarge: { size: 14, lineHeight: 20, weight: fontWeight.medium, letterSpacing: 0.1 },
  label: { size: 12, lineHeight: 16, weight: fontWeight.medium, letterSpacing: 0.5 },
  /** The focus timer's digits. */
  timer: { size: 57, lineHeight: 64, weight: fontWeight.regular, letterSpacing: 0 },
} as const satisfies Record<string, TypeStyle>;

export const layout = {
  /** Window-size breakpoints (min widths). */
  breakpoints: { medium: 600, expanded: 1024, wide: 1440 },
  sidebarWidth: 280,
  railWidth: 80,
  bottomBarHeight: 80,
  appBarHeight: 64,
  contentMaxWidth: 1200,
  rightPanelWidth: 360,
  /** Minimum tap target, and the gap between targets. */
  minTarget: 48,
  targetGap: 8,
  courseStripe: 4,
  focusRing: { width: 2, offset: 2 },
} as const;

export const motion = {
  durationShort: 150,
  durationMedium: 250,
  easing: "cubic-bezier(0.2, 0, 0, 1)",
} as const;
