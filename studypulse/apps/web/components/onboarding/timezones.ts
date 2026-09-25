// Timezone choices for onboarding and settings: the browser's IANA list, always
// including the current value (and UTC) so a saved zone is never missing from the menu.

export const DAILY_MINUTES_OPTIONS = [30, 60, 90, 120, 150, 180, 240, 300, 360] as const;

export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function timezoneOptions(current: string): string[] {
  let zones: string[] = [];
  try {
    zones = Intl.supportedValuesOf("timeZone");
  } catch {
    zones = [];
  }
  return [...new Set([...zones, "UTC", current])].sort((a, b) => a.localeCompare(b));
}
