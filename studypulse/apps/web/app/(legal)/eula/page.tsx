import type { Metadata } from "next";
import Link from "next/link";

import { CompanyName } from "@/components/legal/BusinessInfo";
import { LegalPage } from "@/components/legal/LegalPage";
import { SupportEmail } from "@/components/legal/SupportEmail";

export const metadata: Metadata = { title: "License agreement" };

// Launch safety S22. A short custom EULA for the iOS and Android apps (and the web app).
// App Store Connect → App Information → License Agreement: choose "custom" and paste this
// text, or keep Apple's standard EULA and link this page from the description. It sits
// alongside the Terms of Use, which govern the service itself.
export default function EulaPage() {
  return (
    <LegalPage title="End User License Agreement">
      <p>
        StudyPulse (the app for iOS and Android, and the web app) is{" "}
        <strong>licensed, not sold,</strong> to you by <CompanyName />. This agreement is between
        you and us, not Apple or Google, and it works together with our{" "}
        <Link href="/terms">Terms of Use</Link> and <Link href="/privacy">Privacy Policy</Link>.
      </p>

      <h2>Your license</h2>
      <p>
        We give you a personal, non-exclusive, non-transferable, revocable license to install and
        use StudyPulse on devices you own or control, for your own studying, under these terms and
        the rules of the store you got it from.
      </p>

      <h2>What you may not do</h2>
      <ul>
        <li>
          Copy, modify, or make derivative works of the app, except as the law allows despite this
          limit.
        </li>
        <li>
          Reverse engineer, decompile, or disassemble the app, or try to get its source code, except
          where the law allows it despite this limit.
        </li>
        <li>Rent, lease, sell, redistribute, or sublicense the app.</li>
        <li>Remove notices, or use the app to break the law or anyone&apos;s rights.</li>
      </ul>

      <h2>Ending the license</h2>
      <p>
        The license ends when you stop using the app and delete it, or if you break this agreement.
        You can delete your account at any time in Settings.
      </p>

      <h2>No warranty; limit of liability</h2>
      <p>
        The app is provided &quot;as is&quot; without warranties, to the extent the law allows. We
        are not liable for indirect or consequential losses, and our total liability is limited as
        described in the Terms of Use. Apple and Google have no obligation to provide maintenance or
        support for the app and, to the extent the law allows, no warranty obligation.
      </p>

      <h2>Store terms and third parties</h2>
      <p>
        Apple and its subsidiaries (for the iOS app) and Google (for the Android app) are
        third-party beneficiaries of this agreement and may enforce it. You confirm you&apos;re not
        in a country subject to a US government embargo and not on a US government list of
        prohibited or restricted parties. Questions or claims about the app go to us, not the store:{" "}
        <SupportEmail />.
      </p>
    </LegalPage>
  );
}
