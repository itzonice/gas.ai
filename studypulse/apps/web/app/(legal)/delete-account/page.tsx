import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage } from "@/components/legal/LegalPage";
import { SupportEmail } from "@/components/legal/SupportEmail";

export const metadata: Metadata = { title: "Delete your account" };

// Launch audit L6. Google Play asks for a web page, reachable without signing in, that
// says how to delete an account and what happens to the data. Keep it in step with the
// delete-account edge function and the privacy policy's retention section.
export default function DeleteAccountPage() {
  return (
    <LegalPage title="Delete your StudyPulse account">
      <h2>In the app (fastest)</h2>
      <ol>
        <li>Sign in on the web, iPhone, or Android app.</li>
        <li>Open Settings.</li>
        <li>
          Choose <strong>Delete account</strong> and confirm.
        </li>
      </ol>
      <p>
        Your account is deleted right away. <Link href="/sign-in">Sign in to StudyPulse</Link>.
      </p>

      <h2>If you can&apos;t sign in</h2>
      <p>
        Email <SupportEmail /> from the email address on your account, with the subject &quot;Delete
        my account&quot;. We check that the request comes from that address, then delete the account
        within 30 days and email you when it&apos;s done. You can also{" "}
        <Link href="/reset-password">reset your password</Link> and delete it yourself.
      </p>

      <h2>What gets deleted</h2>
      <ul>
        <li>
          Your account, profile, courses, assignments, grades, study plans and sessions, notes and
          study cards, and reminder settings.
        </li>
        <li>Syllabus files and text you uploaded.</li>
        <li>Connections to Canvas and Google Calendar (we also revoke our access).</li>
        <li>Device push tokens and your privacy and consent choices.</li>
      </ul>
      <p>
        Everything is removed from our database and file storage immediately, and from backups
        within [30] days.
      </p>

      <h2>What we keep, and why</h2>
      <ul>
        <li>
          <strong>Payment records</strong> that tax and accounting law requires are kept by Stripe,
          Apple, or Google, not in StudyPulse.
        </li>
        <li>
          <strong>Subscriptions bought in the App Store or Google Play</strong> aren&apos;t
          cancelled by deleting your account. Cancel them in your store account first. Web
          subscriptions are cancelled automatically.
        </li>
      </ul>

      <h2>Want to keep a copy first?</h2>
      <p>Settings, Export my data downloads everything we hold about you as a file.</p>
    </LegalPage>
  );
}
