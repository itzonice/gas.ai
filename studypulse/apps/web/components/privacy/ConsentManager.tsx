"use client";

// Privacy choices for the whole app (launch safety S23):
// - EU/UK visitors (and anyone whose country is unknown) see a banner with Accept and
//   Reject of equal weight; nothing optional runs until they choose.
// - Browser error reports start only when allowed.
// - Signed in, the choice is saved on the account (consent_log keeps each decision), and
//   product analytics are only stored for students who allowed them.
import { defaultChoices, type PrivacyChoices, type StoredChoices } from "@studypulse/core/privacy";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { useApi, useSession } from "@/components/auth/SessionProvider";
import { Button } from "@/components/ui";
import { startErrorReporting, stopErrorReporting } from "@/lib/error-reporting";
import { onChoicesChange, readChoices, saveChoices } from "@/lib/privacy";

import styles from "./privacy.module.css";

export function ConsentManager() {
  const api = useApi();
  const session = useSession();
  const userId = session.status === "signed-in" ? session.session.user.id : null;
  const [required, setRequired] = useState<boolean | null>(null);
  const [stored, setStored] = useState<StoredChoices | null>(null);
  const synced = useRef<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only storage
    setStored(readChoices());
    let cancelled = false;
    fetch("/api/consent-region")
      .then((r) => r.json() as Promise<{ required?: unknown }>)
      .then(
        (d) => {
          if (!cancelled) setRequired(d.required !== false);
        },
        () => {
          if (!cancelled) setRequired(true);
        },
      );
    const off = onChoicesChange(setStored);
    return () => {
      cancelled = true;
      off();
    };
  }, []);

  const effective: PrivacyChoices | null =
    stored ?? (required === null ? null : defaultChoices(required));

  useEffect(() => {
    if (!effective) return;
    if (effective.errorReports) startErrorReporting();
    else stopErrorReporting();
  }, [effective?.errorReports]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the account in step with this browser's choice (or the opt-in default).
  useEffect(() => {
    if (!userId || !effective) return;
    // Outside the EU/UK with no choice made, the account's own setting stands.
    if (!stored && required === false) return;
    const key = `${userId}:${String(effective.analytics)}:${String(effective.errorReports)}`;
    if (synced.current === key) return;
    synced.current = key;
    void api.privacy.setChoices(effective, "signin").catch(() => {
      synced.current = null;
    });
  }, [api, userId, stored, required, effective]);

  function choose(choices: PrivacyChoices) {
    saveChoices(choices);
    if (userId) {
      synced.current = `${userId}:${String(choices.analytics)}:${String(choices.errorReports)}`;
      void api.privacy.setChoices(choices, "banner").catch(() => undefined);
    }
  }

  if (required !== true || stored) return null;
  return (
    <section className={styles.banner} aria-labelledby="consent-heading">
      <h2 id="consent-heading" className={styles.heading}>
        Your privacy choices
      </h2>
      <p className={styles.text}>
        StudyPulse only stores what it needs to keep you signed in. With your OK, we&apos;d also
        count which features are used and send error reports when something breaks, to improve the
        app. No advertising, no tracking across sites. See the{" "}
        <Link href="/cookies">cookie policy</Link> or choose each option there.
      </p>
      <div className={styles.actions}>
        {/* Equal weight: same size, same style, side by side. */}
        <Button variant="tonal" onClick={() => choose({ analytics: false, errorReports: false })}>
          Reject
        </Button>
        <Button variant="tonal" onClick={() => choose({ analytics: true, errorReports: true })}>
          Accept
        </Button>
      </div>
    </section>
  );
}
