// Shared by web and mobile. Hermes (React Native) may not implement
// Intl.DateTimeFormat#formatRange, so fall back to two formatted ends and a dash.

/** "3:00–3:30 PM"-style range, with the same output on every JavaScript engine that has it. */
export function formatRange(fmt: Intl.DateTimeFormat, start: Date, end: Date): string {
  if (typeof fmt.formatRange === "function") return fmt.formatRange(start, end);
  return `${fmt.format(start)} – ${fmt.format(end)}`;
}
