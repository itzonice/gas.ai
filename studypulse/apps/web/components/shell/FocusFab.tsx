"use client";

// Phones: the focus timer stays one tap away, except where it would be in the way (see
// hidesFocusButton): on the Focus screen itself, in study sessions, and in the note editor.
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon } from "../ui/icons";
import { hidesFocusButton } from "./nav-items";
import styles from "./shell.module.css";

export function FocusFab() {
  const pathname = usePathname();
  if (hidesFocusButton(pathname)) return null;
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
