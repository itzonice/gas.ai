/** Material 3 color roles, as hex strings. */
export interface ColorRoles {
  primary: string;
  onPrimary: string;
  primaryContainer: string;
  onPrimaryContainer: string;
  secondary: string;
  onSecondary: string;
  secondaryContainer: string;
  onSecondaryContainer: string;
  tertiary: string;
  onTertiary: string;
  tertiaryContainer: string;
  onTertiaryContainer: string;
  error: string;
  onError: string;
  errorContainer: string;
  onErrorContainer: string;
  surface: string;
  onSurface: string;
  surfaceVariant: string;
  onSurfaceVariant: string;
  surfaceContainerLowest: string;
  surfaceContainerLow: string;
  surfaceContainer: string;
  surfaceContainerHigh: string;
  surfaceContainerHighest: string;
  outline: string;
  outlineVariant: string;
  inverseSurface: string;
  inverseOnSurface: string;
  inversePrimary: string;
  scrim: string;
  shadow: string;
}

export interface CourseSwatch {
  /** 4 px left stripe (a graphic: 3:1 against surfaces). */
  stripe: string;
  /** Course chip background. */
  chip: string;
  /** Course code text on the chip (4.5:1). */
  onChip: string;
}

/** A vetted course color. Courses store `hex`; UIs render the per-theme swatch. */
export interface CourseColor {
  key: string;
  label: string;
  hex: string;
  light: CourseSwatch;
  dark: CourseSwatch;
}

export type ThemeName = "light" | "dark";
