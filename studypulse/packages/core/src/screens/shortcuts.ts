// App-wide keyboard shortcuts for the web app (launch audit L5). Two-key "g" sequences go
// to the five destinations; single keys start focus, upload a syllabus, or show the list.
// They're character-key shortcuts, so they can be turned off (WCAG 2.1.4), and they never
// fire while typing in a field or with Ctrl, Alt, or Cmd held.

export type ShortcutAction = { href: string } | { help: true };

export interface Shortcut {
  keys: readonly string[];
  label: string;
  action: ShortcutAction;
}

export const SHORTCUTS: readonly Shortcut[] = [
  { keys: ["g", "t"], label: "Go to Today", action: { href: "/today" } },
  { keys: ["g", "c"], label: "Go to Calendar", action: { href: "/calendar" } },
  { keys: ["g", "o"], label: "Go to Courses", action: { href: "/courses" } },
  { keys: ["g", "f"], label: "Go to Focus", action: { href: "/focus" } },
  { keys: ["g", "s"], label: "Go to Stats", action: { href: "/stats" } },
  { keys: ["f"], label: "Start a focus session", action: { href: "/focus?start=1" } },
  { keys: ["u"], label: "Upload a syllabus", action: { href: "/courses/upload" } },
  { keys: ["?"], label: "Show keyboard shortcuts", action: { help: true } },
];

export const SHORTCUTS_KEY = "studypulse.shortcuts";
/** How long the first key of a sequence waits for the second. */
export const SEQUENCE_TIMEOUT_MS = 1500;

const same = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((k, i) => k === b[i]);
const startsWith = (keys: readonly string[], prefix: readonly string[]) =>
  prefix.length < keys.length && prefix.every((k, i) => keys[i] === k);

/**
 * Feeds one key press. Returns the shortcut it completes (if any) and the keys still
 * waiting for more. A key that fits nothing starts over on its own.
 */
export function matchShortcut(
  pending: readonly string[],
  key: string,
): { match: Shortcut | null; pending: string[] } {
  const attempt = (seq: string[]) => {
    const match = SHORTCUTS.find((s) => same(s.keys, seq));
    if (match) return { match, pending: [] };
    if (SHORTCUTS.some((s) => startsWith(s.keys, seq))) return { match: null, pending: seq };
    return null;
  };
  return attempt([...pending, key]) ?? attempt([key]) ?? { match: null, pending: [] };
}

/** "g then t", for the help list and screen readers. */
export function describeKeys(keys: readonly string[]): string {
  return keys.join(" then ");
}
