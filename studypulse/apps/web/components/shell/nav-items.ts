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
  { href: "/focus", label: "Focus", icon: "focus" },
  { href: "/stats", label: "Stats", icon: "stats" },
];

/** Bottom of the sidebar and rail; reached from the profile menu on phones. */
export const secondaryDestinations: readonly NavItem[] = [
  { href: "/settings", label: "Settings", icon: "settings" },
];

export const isActive = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`);
