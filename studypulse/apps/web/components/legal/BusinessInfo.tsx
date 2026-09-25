// Who sells StudyPulse and how to reach them (launch safety S28): legal business name,
// mailing address, and support email, in the site footer and on the checkout page.
import { businessInfo } from "@studypulse/core/legal";
import Link from "next/link";

import styles from "./footer.module.css";
import { SupportEmail } from "./SupportEmail";

// Referenced literally so Next inlines them (see SupportEmail).
export const business = businessInfo({
  legalName: process.env.NEXT_PUBLIC_COMPANY_LEGAL_NAME,
  address: process.env.NEXT_PUBLIC_COMPANY_ADDRESS,
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL,
});

export function CompanyName() {
  return <>{business.legalName}</>;
}

export function CompanyAddress() {
  return <>{business.address}</>;
}

/** "StudyPulse is operated by <name>, <address>. Support: <email>." */
export function BusinessLine() {
  return (
    <>
      StudyPulse is operated by <CompanyName />, <CompanyAddress />. Support: <SupportEmail />
    </>
  );
}

export function SiteFooter({ className }: { className?: string }) {
  return (
    <footer className={className ? `${styles.footer} ${className}` : styles.footer}>
      <nav aria-label="Legal" className={styles.links}>
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
        <Link href="/refunds">Refunds</Link>
        <Link href="/cookies">Cookies</Link>
        <Link href="/copyright">Copyright</Link>
      </nav>
      <address className={styles.business}>
        <BusinessLine />
      </address>
    </footer>
  );
}
