import { TERMS_VERSION } from "@studypulse/core/legal";
import { PARSE_LIMITS, PLAN_FEATURES } from "@studypulse/core/plans";
import type { Metadata } from "next";
import Link from "next/link";

import { CompanyName } from "@/components/legal/BusinessInfo";
import { LegalPage, legalStyles as styles } from "@/components/legal/LegalPage";
import { SupportEmail } from "@/components/legal/SupportEmail";

export const metadata: Metadata = { title: "Terms of Use" };

// Launch safety S21. Limits and plan contents are read from @studypulse/core/plans, the
// same values the database enforces, so this page can't drift from them. Acceptance of
// TERMS_VERSION is recorded at sign-up and checkout (public.terms_acceptances); bump the
// version (here and in private.current_terms_version) when the terms change materially.
export default function TermsPage() {
  const free = PARSE_LIMITS.free.dailyParses;
  const pro = PARSE_LIMITS.pro.dailyParses;
  return (
    <LegalPage title="Terms of Use">
      <p className={styles.meta}>Version {TERMS_VERSION}</p>
      <p>
        These terms are an agreement between you and <CompanyName /> (&quot;we&quot;) for using
        StudyPulse on the web and in the iOS and Android apps. By creating an account or subscribing
        you agree to them and to our <Link href="/privacy">Privacy Policy</Link>. We record which
        version you accepted and when.
      </p>

      <h2>Who can use StudyPulse</h2>
      <p>
        You must be at least 13 years old. If you are under the age of majority where you live, a
        parent or guardian must agree to these terms for you. You are responsible for your account
        and for keeping your password private.
      </p>

      <h2>AI-read dates can be wrong: check them</h2>
      <p>
        StudyPulse reads syllabi with AI. It can misread or miss a date, a weight, or an assignment,
        and grade and plan calculations are only as good as the data they use.{" "}
        <strong>
          Always check every date and weight against your syllabus and your instructor&apos;s
          announcements
        </strong>
        ; the review screen flags items it&apos;s unsure about, but you are responsible for your own
        deadlines. Your school&apos;s records and your instructor are authoritative. StudyPulse is a
        study aid.
      </p>

      <h2>Free and Pro</h2>
      <p>
        The free plan and Pro include the following. Each limit resets at midnight in your time
        zone.
      </p>
      <div
        className={styles.tableWrap}
        tabIndex={0}
        role="region"
        aria-label="Free and Pro compared"
      >
        <table>
          <thead>
            <tr>
              <th scope="col">Feature</th>
              <th scope="col">Free</th>
              <th scope="col">Pro</th>
            </tr>
          </thead>
          <tbody>
            {PLAN_FEATURES.map((f) => (
              <tr key={f.label}>
                <th scope="row">{f.label}</th>
                <td>{f.free}</td>
                <td>{f.pro}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        In particular: syllabus imports are limited to {free} a day on the free plan and {pro} a day
        on Pro.
      </p>

      <h2>Fair use</h2>
      <p>
        StudyPulse is for your own studying. Don&apos;t share an account, resell access, automate
        requests, or upload material to process it for other people. We also cap how much AI
        processing any one account can use in a day, so one account can&apos;t degrade the service
        for everyone; if you reach it, AI features pause until the next day. We may limit or suspend
        accounts that abuse the service, and we&apos;ll tell you why.
      </p>

      <h2>Your content</h2>
      <p>
        You keep ownership of what you upload and create. You give us permission to store and
        process it only to run StudyPulse for you. Only upload material you have the right to use.
        Don&apos;t use StudyPulse to break your school&apos;s academic-integrity rules or the law,
        or to interfere with the service. To report copyright infringement, see{" "}
        <Link href="/copyright">Copyright and takedowns</Link>.
      </p>

      <h2>Subscriptions</h2>
      <ul>
        <li>
          Pro renews automatically each month or year until you cancel. The price and billing
          frequency are shown before you pay.
        </li>
        <li>
          Cancel any time: on the web in Settings (one click to the billing portal), or in your App
          Store or Google Play subscription settings for purchases made there. Pro stays on until
          the end of the paid period.
        </li>
        <li>
          Refunds follow our <Link href="/refunds">refund policy</Link>: App Store and Google Play
          purchases are refunded by Apple and Google; for web purchases, a full refund ends Pro
          immediately and a partial refund changes nothing.
        </li>
      </ul>

      <h2>Ending your account</h2>
      <p>
        You can delete your account at any time in Settings. We may suspend accounts that break
        these terms, and we will tell you why unless the law prevents it.
      </p>

      <h2>Disclaimers and limitation of liability</h2>
      <p>
        StudyPulse is provided &quot;as is&quot; and &quot;as available&quot;. To the extent the law
        allows, we make no warranties about accuracy (including of AI-read dates, grades, and plans)
        or availability, and we are not liable for indirect or consequential losses, including
        missed deadlines, lower grades, or academic consequences. Our total liability for any claim
        is limited to the greater of what you paid us in the 12 months before the claim and US $50.
        Nothing here limits rights you have under consumer law that can&apos;t be waived.
      </p>

      <h2>Changes and contact</h2>
      <p>
        We will post changes here, with a new version date, and give notice in the app or by email
        before significant changes take effect; we&apos;ll ask you to accept the new version. These
        terms are governed by the laws of [jurisdiction]. Contact: <SupportEmail />.
      </p>
    </LegalPage>
  );
}
