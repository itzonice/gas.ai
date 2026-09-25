"use client";

// The navigation list. One list, three presentations (sidebar, rail, bottom bar) chosen
// by CSS in shell.module.css, so structure and tab order never change with screen size.
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon } from "./icons";
import { destinations, isActive, secondaryDestinations, type NavItem } from "./nav-items";
import styles from "./shell.module.css";

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isActive(pathname, item.href);
  return (
    <li>
      <Link href={item.href} className={styles.navLink} aria-current={active ? "page" : undefined}>
        <span className={styles.navIndicator}>
          <Icon name={item.icon} />
        </span>
        <span className={styles.navLabel}>{item.label}</span>
      </Link>
    </li>
  );
}

export function NavLinks() {
  const pathname = usePathname();
  return (
    <>
      <ul className={styles.navList}>
        {destinations.map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} />
        ))}
      </ul>
      <ul className={`${styles.navList} ${styles.navSecondary}`}>
        {secondaryDestinations.map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} />
        ))}
      </ul>
    </>
  );
}
