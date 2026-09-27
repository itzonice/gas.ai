import type { Metadata } from "next";

import { LegalPage } from "@/components/legal/LegalPage";
import { SupportEmail } from "@/components/legal/SupportEmail";

export const metadata: Metadata = { title: "Accessibility" };

// Launch audit L6: a public accessibility statement with a way to report problems. Keep
// the "known limitations" list honest; docs/accessibility.md has the audit behind it.
export default function AccessibilityPage() {
  return (
    <LegalPage title="Accessibility statement">
      <p>
        We want everyone to be able to use StudyPulse, including people who use screen readers,
        keyboards, switch controls, zoom, or larger text.
      </p>

      <h2>Our goal</h2>
      <p>
        StudyPulse aims to meet the Web Content Accessibility Guidelines (WCAG) 2.2 at level AA.
      </p>

      <h2>What we do</h2>
      <ul>
        <li>Every screen can be used with a keyboard alone, with a visible focus indicator.</li>
        <li>Buttons and links are at least 48 by 48 pixels.</li>
        <li>Status is never shown by color alone, and both light and dark themes are checked.</li>
        <li>Pages work at 320 pixels wide and with text enlarged to 200%.</li>
        <li>
          The focus timer can be paused, and its updates are announced politely to screen readers.
        </li>
        <li>
          Automated accessibility checks run on every screen with every code change, and before each
          release.
        </li>
      </ul>

      <h2>Known limitations</h2>
      <ul>
        <li>
          We haven&apos;t yet finished testing the iPhone and Android apps with VoiceOver and
          TalkBack on real devices.
        </li>
        <li>The end of a focus session isn&apos;t yet signaled by sound or vibration.</li>
        <li>
          Syllabus PDFs you upload are read as they are; we can&apos;t fix their accessibility.
        </li>
      </ul>

      <h2>Tell us about a problem</h2>
      <p>
        If something in StudyPulse is hard to use, email <SupportEmail /> with the page or screen
        and what happened. We reply within 5 business days, and if we can&apos;t fix it quickly
        we&apos;ll help you another way.
      </p>
    </LegalPage>
  );
}
