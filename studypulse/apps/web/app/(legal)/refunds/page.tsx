import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage } from "@/components/legal/LegalPage";
import { SupportEmail } from "@/components/legal/SupportEmail";

export const metadata: Metadata = { title: "Refund policy" };

// Launch safety S18. Matches the refund handling already built (stripe-webhook):
// a full refund ends Pro at once and cancels the subscription; a partial refund changes
// nothing. The refund window is the owner's decision: replace [N] before launch.
export default function RefundsPage() {
  return (
    <LegalPage title="Refund policy">
      <h2>Web purchases (paid through our site)</h2>
      <ul>
        <li>
          You can ask for a full refund within <strong>[N] days</strong> of a charge by emailing{" "}
          <SupportEmail /> from your account&apos;s email address.
        </li>
        <li>
          <strong>A full refund ends Pro right away</strong> and cancels the subscription, so you
          won&apos;t be charged again. Your courses and data stay; your account goes back to the
          free plan and its limits.
        </li>
        <li>
          Sometimes we give a <strong>partial refund</strong> (for example, for an outage). A
          partial refund doesn&apos;t change your plan: Pro keeps running until the end of the
          period you paid for and renews as usual unless you cancel.
        </li>
        <li>
          To stop future charges without a refund, cancel anytime in Settings → Manage subscription.
          You keep Pro until the end of the period you paid for.
        </li>
      </ul>

      <h2>App Store and Google Play purchases</h2>
      <p>
        Apple and Google handle payments and refunds for subscriptions bought in their stores, so we
        can&apos;t refund them ourselves. Request a refund at{" "}
        <a href="https://reportaproblem.apple.com">reportaproblem.apple.com</a> or in your Google
        Play order history. If they refund you, Pro ends when they tell us.
      </p>

      <h2>Questions</h2>
      <p>
        Email <SupportEmail /> before disputing a charge with your bank; we&apos;ll sort it out
        faster. See also our <Link href="/terms">Terms of Use</Link>.
      </p>
    </LegalPage>
  );
}
