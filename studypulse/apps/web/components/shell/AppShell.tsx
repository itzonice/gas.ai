// The app frame: skip link, app bar, navigation, main, footer. Server component; only the
// nav list (which needs the current path) is a client component.
import Link from "next/link";
import { Suspense, type ReactNode } from "react";

import { Icon } from "../ui/icons";
import { FocusFab } from "./FocusFab";
import { NavLinks } from "./NavLinks";
import { RouteFocus } from "./RouteFocus";
import styles from "./shell.module.css";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <a className={styles.skipLink} href="#main">
        Skip to main content
      </a>

      <header className={styles.appBar}>
        <Link href="/today" className={styles.logo} aria-label="StudyPulse home">
          <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
            <rect width="32" height="32" rx="8" fill="var(--sp-color-primary)" />
            <path
              d="M6 17h5l2.5-6 4 11 3-8 1.5 3H26"
              fill="none"
              stroke="var(--sp-color-on-primary)"
              strokeWidth="2.25"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>StudyPulse</span>
        </Link>

        <form role="search" action="/search" className={styles.search}>
          <label htmlFor="app-search" className={styles.visuallyHidden}>
            Search courses and assignments
          </label>
          <Icon name="search" className={styles.searchIcon} />
          <input
            id="app-search"
            name="q"
            type="search"
            placeholder="Search courses and assignments"
            autoComplete="off"
            className={styles.searchInput}
          />
        </form>

        <div className={styles.appBarActions}>
          {/* Phones: search moves behind this one action. */}
          <Link
            href="/search"
            className={`${styles.iconButton} ${styles.phoneOnly}`}
            aria-label="Search"
          >
            <Icon name="search" />
          </Link>
          <Link
            href="/notifications"
            className={`${styles.iconButton} ${styles.hideOnPhone}`}
            aria-label="Notifications"
          >
            <Icon name="notifications" />
          </Link>
          <Link
            href="/settings/account"
            className={`${styles.iconButton} ${styles.hideOnPhone}`}
            aria-label="Account and profile"
          >
            <Icon name="account" />
          </Link>
        </div>
      </header>

      <nav className={styles.nav} aria-label="Main">
        <Suspense fallback={null}>
          <NavLinks />
        </Suspense>
      </nav>

      <div className={styles.body}>
        <main id="main" tabIndex={-1} className={styles.main}>
          {children}
        </main>
        <footer className={styles.footer}>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/help">Help</Link>
        </footer>
      </div>

      <FocusFab />
      <RouteFocus />
    </div>
  );
}
