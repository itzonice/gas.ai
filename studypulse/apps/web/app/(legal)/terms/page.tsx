import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = { title: "Terms of Use" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Use">
      <p>
        These terms are an agreement between you and [Company legal name] (&quot;we&quot;) for using
        StudyPulse on the web and in the iOS and Android apps. By creating an account you agree to
        them and to our <Link href="/privacy">Privacy Policy</Link>.
      </p>

      <h2>Who can use StudyPulse</h2>
      <p>
        You must be at least 13 years old. If you are under the age of majority where you live, a
        parent or guardian must agree to these terms for you. You are responsible for your account
        and for keeping your password private.
      </p>

      <h2>What StudyPulse does, and what it doesn&apos;t</h2>
      <p>
        StudyPulse reads syllabi with AI, computes grades, and suggests study plans and reminders.
        AI can misread a syllabus, and grade and plan calculations depend on the data entered.
        Always check dates, weights, and grades against your course materials and your instructor.
        StudyPulse is a study aid; your school&apos;s records are authoritative.
      </p>

      <h2>Your content</h2>
      <p>
        You keep ownership of what you upload and create. You give us permission to store and
        process it only to run StudyPulse for you. Only upload material you have the right to use.
        Don&apos;t use StudyPulse to break your school&apos;s academic-integrity rules or the law,
        or to interfere with the service.
      </p>

      <h2>Subscriptions</h2>
      <ul>
        <li>
          StudyPulse Pro renews automatically each month or year until you cancel. The price is
          shown before you pay.
        </li>
        <li>
          Cancel any time: on the web in Settings (one click to the billing portal), or in your App
          Store or Google Play subscription settings for purchases made there. Pro stays on until
          the end of the paid period.
        </li>
        <li>
          Refunds for App Store and Google Play purchases are handled by Apple and Google. For web
          purchases, contact [support email]; a full refund ends Pro immediately.
        </li>
      </ul>

      <h2>Ending your account</h2>
      <p>
        You can delete your account at any time in Settings. We may suspend accounts that break
        these terms, and we will tell you why unless the law prevents it.
      </p>

      <h2>Disclaimers and limits</h2>
      <p>
        StudyPulse is provided &quot;as is&quot;. To the extent the law allows, we are not liable
        for indirect or consequential losses, including missed deadlines or grades, and our total
        liability is limited to what you paid us in the 12 months before the claim. Nothing here
        limits rights you have under consumer law that can&apos;t be waived.
      </p>

      <h2>Changes and contact</h2>
      <p>
        We will post changes here and give notice in the app or by email before significant changes
        take effect. These terms are governed by the laws of [jurisdiction]. Contact: [support
        email].
      </p>
    </LegalPage>
  );
}
