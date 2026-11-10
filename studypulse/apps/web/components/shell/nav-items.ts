import type { IconName } from "../ui/icons";

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
}

/** The five top-level destinations, in order, at every screen size. */
export const destinations: readonly NavItem[] = [
  { href: "/today", label: "Today", icon: "today" },
  { href: "/calendar", label: "Calendar", icon: "calendar" },
  { href: "/courses", label: "Courses", icon: "courses" },
  { href: "/study", label: "Study", icon: "study" },
  { href: "/focus", label: "Focus", icon: "focus" },
];

/**
 * Bottom of the sidebar and rail. On phones, whose bottom bar holds the five main
 * destinations, Settings is the account button in the app bar and Stats is linked from
 * Today and Focus.
 */
export const secondaryDestinations: readonly NavItem[] = [
  { href: "/stats", label: "Stats", icon: "stats" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

export const isActive = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`);

/**
 * Where the phone's floating "Start focus" button stays out of the way: the Focus screen
 * (its own Start button is the primary action), and the study sessions and the note
 * editor, where it would cover the controls and the text being typed.
 */
export function hidesFocusButton(pathname: string): boolean {
  return (
    pathname === "/focus" ||
    pathname.startsWith("/focus/") ||
    pathname === "/study/review" ||
    pathname.startsWith("/study/notes/") ||
    /^\/study\/sets\/[^/]+\/[^/]+/.test(pathname)
  );
}
