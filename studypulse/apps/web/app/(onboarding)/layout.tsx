import { SiteFooter } from "@/components/legal/BusinessInfo";
import styles from "@/components/auth/auth.module.css";
import { RequireAuth } from "@/components/auth/RequireAuth";

// Onboarding: signed in, but no app shell yet; one card centered on the page.
export default function OnboardingLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <main id="main" className={styles.authMain}>
        <RequireAuth skipOnboarding>{children}</RequireAuth>
      </main>
      <SiteFooter />
    </>
  );
}
