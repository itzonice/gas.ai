import { OPTIONAL_PROCESSING, PRIVACY_VERSION, STORAGE_INVENTORY } from "@studypulse/core/privacy";
import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage, legalStyles as styles } from "@/components/legal/LegalPage";
import { SupportEmail } from "@/components/legal/SupportEmail";
import { PrivacyChoicesForm } from "@/components/privacy/PrivacyChoicesForm";

export const metadata: Metadata = { title: "Cookie policy" };

// Launch safety S23. Rendered from STORAGE_INVENTORY and OPTIONAL_PROCESSING in
// @studypulse/core/privacy, so the page lists exactly what the app does.
export default function CookiesPage() {
  return (
    <LegalPage title="Cookie policy">
      <p className={styles.meta}>Version {PRIVACY_VERSION}</p>
      <p>
        StudyPulse sets <strong>no cookies</strong> and uses no advertising or cross-site tracking.
        It keeps a few items in your browser&apos;s storage that it needs to work, listed below. Two
        optional kinds of processing (product analytics and error reports) run only if you allow
        them; in the EU, the EEA, the UK, and Switzerland they are off until you choose.
      </p>

      <h2>What we store in your browser</h2>
      <div
        className={styles.tableWrap}
        tabIndex={0}
        role="region"
        aria-label="What we store in your browser"
      >
        <table>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Where</th>
              <th scope="col">What it&apos;s for</th>
              <th scope="col">How long</th>
            </tr>
          </thead>
          <tbody>
            {STORAGE_INVENTORY.map((item) => (
              <tr key={item.name}>
                <th scope="row">
                  <code>{item.name}</code>
                </th>
                <td>{item.kind}</td>
                <td>
                  {item.purpose} {item.essential ? "(needed for the app to work)" : ""}
                </td>
                <td>{item.lifetime}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Optional processing</h2>
      <ul>
        {OPTIONAL_PROCESSING.map((p) => (
          <li key={p.choice}>
            <strong>{p.name}.</strong> {p.purpose}
          </li>
        ))}
      </ul>

      <h2>Your choices</h2>
      <p>
        Change them here at any time; they apply right away. When you&apos;re signed in they&apos;re
        also saved to your account, with the date and this policy&apos;s version.
      </p>
      <PrivacyChoicesForm />

      <p>
        More in our <Link href="/privacy">Privacy Policy</Link>. Questions: <SupportEmail />.
      </p>
    </LegalPage>
  );
}
