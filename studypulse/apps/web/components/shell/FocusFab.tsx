"use client";

// Phones: the focus timer stays one tap away, except on the Focus screen itself, where
// the page's own Start/Pause button is the primary action and a second one would cover
// the timer's controls.
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon } from "../ui/icons";
import styles from "./shell.module.css";

export function FocusFab() {
  const pathname = usePathname();
  if (pathname === "/focus" || pathname.startsWith("/focus/")) return null;
  // In its own landmark so it isn't stray content outside the page regions.
  return (
    <nav aria-label="Quick action">
      <Link href="/focus?start=1" className={styles.fab}>
        <Icon name="play" />
        <span>Start focus</span>
      </Link>
    </nav>
  );
}
