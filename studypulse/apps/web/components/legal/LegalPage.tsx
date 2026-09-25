// Shared frame for the Terms of Use and Privacy Policy. While LEGAL_DRAFT is true every
// page says so at the top: the text must be reviewed by counsel (and the bracketed
// details filled in) before launch. See docs/launch-checklist.md.
import Link from "next/link";
import type { ReactNode } from "react";

import styles from "./legal.module.css";

export const LEGAL_DRAFT = true;
export const LEGAL_UPDATED = "September 25, 2026";

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main id="main" className={styles.main}>
      <article className={styles.article}>
        <Link href="/" className={styles.home}>
          StudyPulse home
        </Link>
        <h1>{title}</h1>
        <p className={styles.meta}>Last updated {LEGAL_UPDATED}</p>
        {LEGAL_DRAFT ? (
          <p className={styles.draft} role="note">
            Draft: not yet in effect. This text is being reviewed before StudyPulse launches.
          </p>
        ) : null}
        {children}
      </article>
    </main>
  );
}

export { styles as legalStyles };
