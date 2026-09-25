import styles from "@/components/auth/auth.module.css";

// Signed-out screens: no app shell, just the form centered on the page.
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main id="main" className={styles.authMain}>
      {children}
    </main>
  );
}
