// The app frame: skip link, app bar, navigation, main, footer. Server component; only the
// nav list (which needs the current path) is a client component.
import Link from "next/link";
import { Suspense, type ReactNode } from "react";

import { SiteFooter } from "../legal/BusinessInfo";
import { Icon } from "../ui/icons";
import { FocusFab } from "./FocusFab";
import { NavLinks } from "./NavLinks";
import { OfflineBanner } from "./OfflineBanner";
import { RouteFocus } from "./RouteFocus";
import { Shortcuts } from "./Shortcuts";
import { ThemeToggle } from "./ThemeToggle";
import styles from "./shell.module.css";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <a className={styles.skipLink} href="#main">
        Skip to main content
      </a>

      <header className={styles.appBar}>
        <Link href="/today" className={styles.logo} aria-label="StudyPulse home">
          <span className={styles.logoMark} aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 32 32" focusable="false" aria-hidden="true">
              <path
                d="M4 17h6l3-7 5 13 3.5-9 2 3H28"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className={styles.wordmark}>studypulse</span>
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
          <ThemeToggle />
          {/* Phones: search moves behind this one action. */}
          <Link
            href="/search"
            className={`${styles.iconButton} ${styles.phoneOnly}`}
            aria-label="Search"
          >
            <Icon name="search" />
          </Link>
          <Link
            href="/settings#reminders-heading"
            className={`${styles.iconButton} ${styles.hideOnPhone}`}
            aria-label="Reminder settings"
          >
            <Icon name="notifications" />
          </Link>
          <Link href="/settings" className={styles.iconButton} aria-label="Account and settings">
            <Icon name="account" />
          </Link>
        </div>
      </header>

      <nav className={styles.nav} aria-label="Main">
        <Suspense fallback={null}>
          <NavLinks />
        </Suspense>
        <Shortcuts />
      </nav>

      <div className={styles.body}>
        <main id="main" tabIndex={-1} className={styles.main}>
          <OfflineBanner />
          {children}
        </main>
        <SiteFooter />
      </div>

      <FocusFab />
      <RouteFocus />
    </div>
  );
}
