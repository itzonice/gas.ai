import type { Metadata } from "next";

import { LegalPage, legalStyles as styles } from "@/components/legal/LegalPage";

export const metadata: Metadata = { title: "Privacy Policy" };

// Every service that receives user data. Keep in sync with the code: a new processor
// needs a row here (and in the App Store privacy labels) before it ships.
const PROCESSORS: { name: string; purpose: string; data: string }[] = [
  {
    name: "Supabase",
    purpose: "Database, sign-in, file storage, and server functions",
    data: "Everything you store in StudyPulse: account, courses, grades, study sessions, uploaded syllabi",
  },
  {
    name: "Vercel",
    purpose: "Hosting the web app",
    data: "Web requests (IP address, browser details) in server logs",
  },
  {
    name: "Anthropic",
    purpose: "Reading syllabi and turning notes into study cards",
    data: "The syllabus text or images and notes you submit; no name or email is sent",
  },
  {
    name: "Stripe",
    purpose: "Payments on the web",
    data: "Email, payment details (handled by Stripe; we never see card numbers), subscription status",
  },
  {
    name: "RevenueCat",
    purpose: "Purchases in the iOS and Android apps",
    data: "An account identifier and subscription status",
  },
  {
    name: "Resend",
    purpose: "Sending email (confirmations, daily summaries if you turn them on)",
    data: "Email address and the message contents",
  },
  {
    name: "Sentry",
    purpose: "Crash and error reports",
    data: "Technical details about errors; names, emails, and cookies are removed before sending",
  },
  {
    name: "PostHog",
    purpose: "Product analytics",
    data: "Which features are used (for example, a syllabus was parsed), linked to an account identifier",
  },
  {
    name: "Expo",
    purpose: "Delivering push notifications to the mobile app",
    data: "A device push token and the notification text",
  },
  {
    name: "Google",
    purpose:
      "Google Calendar sync, only if you connect it; web push in Chrome goes through Google's push service",
    data: "Calendar busy times you allow us to read, the study blocks and deadlines we add, notification text",
  },
  {
    name: "Apple",
    purpose: "App Store purchases and iOS push notifications",
    data: "Purchase records (handled by Apple) and notification text",
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <p>
        StudyPulse (&quot;we&quot;) is operated by [Company legal name], [address]. This policy
        explains what we collect when you use StudyPulse on the web or in the iOS and Android apps,
        why, who else handles it, and your choices. Questions: [privacy contact email].
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Account:</strong> email address, password (stored hashed by our sign-in provider),
          name and school if you add them, timezone, and your age confirmation.
        </li>
        <li>
          <strong>What you add:</strong> syllabi you upload or paste, courses, assignments, grades
          and scores, study sessions and plans, notes you turn into cards, and reminder preferences.
        </li>
        <li>
          <strong>Connected services, if you connect them:</strong> Canvas course and assignment
          data; Google Calendar busy times.
        </li>
        <li>
          <strong>Purchases:</strong> subscription status and history. Card details go to Stripe,
          Apple, or Google, never to us.
        </li>
        <li>
          <strong>Technical:</strong> device push tokens, error reports, and which features are
          used.
        </li>
      </ul>

      <h2>How we use it</h2>
      <p>
        To run StudyPulse for you: read your syllabi, compute grades, plan study time, send the
        reminders you ask for, process payments, keep the service secure, and understand which
        features help. We do not sell personal information, and we do not use it for advertising or
        to train AI models.
      </p>

      <h2>Who else handles your data</h2>
      <p>
        These companies process data for us, under contracts that limit them to providing their
        service:
      </p>
      {/* The table scrolls on its own on narrow screens; the page never scrolls sideways. */}
      <div
        className={styles.tableWrap}
        role="region"
        aria-label="Services that handle your data"
        tabIndex={0}
      >
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Service</th>
              <th scope="col">What for</th>
              <th scope="col">What they receive</th>
            </tr>
          </thead>
          <tbody>
            {PROCESSORS.map((p) => (
              <tr key={p.name}>
                <th scope="row">{p.name}</th>
                <td>{p.purpose}</td>
                <td>{p.data}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        If you join a school or organization in StudyPulse and turn on sharing, that organization
        sees only weekly focus-hour totals, never your grades or individual sessions.
      </p>

      <h2>Children</h2>
      <p>
        StudyPulse is not for children under 13. Sign-up (or, with Apple or Google, the first screen
        after it) asks for your birth month and year; we use it only to check that you are 13 or
        older and don&apos;t keep it. If you are under 13, no account is created, or the one just
        made is deleted at once. If we learn that we have an account for a child under 13, we delete
        it. If you believe a child under 13 has an account, contact [privacy contact email].
      </p>

      <h2>How long we keep it</h2>
      <p>
        Until you delete it or your account. When you delete your account, your data and files are
        removed from our database and storage right away and from backups within [30] days. Payment
        records we must keep by law are kept by Stripe, Apple, or Google. To stop abuse, we count
        requests per account and per network address; addresses are stored only as one-way hashes
        and the counts are deleted within a day.
      </p>

      <h2>Your choices and rights</h2>
      <ul>
        <li>Download everything we hold about you: Settings, Export my data.</li>
        <li>Delete your account and data: Settings, Delete account (web and apps).</li>
        <li>Turn reminders and emails off: Settings, Reminders; or the link in any email.</li>
        <li>Disconnect Canvas or Google Calendar at any time.</li>
        <li>
          Depending on where you live (for example the EU, UK, or California), you may also have
          rights to access, correct, or object to processing. Contact [privacy contact email]; we
          answer within 30 days.
        </li>
      </ul>

      <h2>Security</h2>
      <p>
        Data is encrypted in transit and at rest. Each account can only read its own data, enforced
        in the database. Connection tokens for Canvas and Google are stored encrypted.
      </p>

      <h2>Changes</h2>
      <p>
        We will post changes here and, for significant changes, tell you in the app or by email
        before they take effect.
      </p>
    </LegalPage>
  );
}
