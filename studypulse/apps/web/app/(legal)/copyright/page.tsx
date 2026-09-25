import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = { title: "Copyright and takedowns" };

// Launch safety S17. The designated agent must be registered with the US Copyright Office
// (https://dmca.copyright.gov, $6, renewed every 3 years) and the bracketed details
// replaced with exactly what was registered. See docs/takedowns.md for how notices are
// handled.
export default function CopyrightPage() {
  return (
    <LegalPage title="Copyright and takedowns">
      <p>
        StudyPulse respects copyright. Students upload syllabi and course material for their own
        study, and our <Link href="/terms">Terms of Use</Link> only allow uploading material they
        have the right to use. Nothing a student uploads is shown to anyone else.
      </p>

      <h2>Reporting infringement</h2>
      <p>
        If you believe material on StudyPulse infringes your copyright, send a notice to our
        designated agent:
      </p>
      <address>
        [Designated agent name]
        <br />
        [Company legal name]
        <br />
        [Street address or PO box, City, State ZIP, Country]
        <br />
        Email: [copyright email]
        <br />
        Phone: [phone]
      </address>
      <p>Under the Digital Millennium Copyright Act (17 U.S.C. § 512(c)(3)), include:</p>
      <ol>
        <li>Your physical or electronic signature.</li>
        <li>The copyrighted work you believe is infringed.</li>
        <li>
          The material you want removed and enough detail for us to find it (for example, the shared
          link or the account it appears in).
        </li>
        <li>Your name, address, phone number, and email.</li>
        <li>
          A statement that you believe in good faith that the use isn&apos;t authorized by the
          copyright owner, its agent, or the law.
        </li>
        <li>
          A statement, under penalty of perjury, that the notice is accurate and that you are the
          owner or authorized to act for the owner.
        </li>
      </ol>

      <h2>What happens next</h2>
      <p>
        We review complete notices promptly, remove or disable the material, and tell the account
        holder. We keep a record of every notice and what we did.
      </p>

      <h2>Counter-notices</h2>
      <p>
        If your material was removed and you believe that was a mistake or misidentification, you
        can send a counter-notice to the same address with your signature, the material removed and
        where it was, a statement under penalty of perjury that you believe it was removed by
        mistake, and your name, address, phone number, and consent to the jurisdiction of the
        federal court for your district (or, outside the US, [jurisdiction]). We forward it to the
        person who sent the notice and may restore the material after 10 business days unless they
        tell us they have filed a lawsuit.
      </p>

      <h2>Repeat infringers</h2>
      <p>We close the accounts of people who repeatedly infringe copyright.</p>
    </LegalPage>
  );
}
