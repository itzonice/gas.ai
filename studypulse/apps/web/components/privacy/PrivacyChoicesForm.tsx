"use client";

// Change privacy choices at any time (cookie policy page and Settings). Nothing is
// pre-checked for visitors who haven't chosen and must opt in (S24).
import { defaultChoices, OPTIONAL_PROCESSING, type PrivacyChoices } from "@studypulse/core/privacy";
import { useEffect, useState, type FormEvent } from "react";

import { useApi, useSession } from "@/components/auth/SessionProvider";
import { Button, CheckboxField } from "@/components/ui";
import { readChoices, saveChoices } from "@/lib/privacy";

import styles from "./privacy.module.css";

export function PrivacyChoicesForm() {
  const api = useApi();
  const session = useSession();
  const [choices, setChoices] = useState<PrivacyChoices>(defaultChoices(true));
  const [status, setStatus] = useState("");

  useEffect(() => {
    const saved = readChoices();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only storage
    if (saved) setChoices({ analytics: saved.analytics, errorReports: saved.errorReports });
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    saveChoices(choices);
    if (session.status === "signed-in") {
      await api.privacy.setChoices(choices, "settings").catch(() => undefined);
    }
    setStatus("Saved. Your choices apply right away.");
  }

  return (
    <form className={styles.form} onSubmit={(e) => void submit(e)}>
      {OPTIONAL_PROCESSING.map((p) => (
        <CheckboxField
          key={p.choice}
          label={p.name}
          hint={p.purpose}
          checked={choices[p.choice]}
          onChange={(e) => setChoices({ ...choices, [p.choice]: e.target.checked })}
        />
      ))}
      <div>
        <Button type="submit" variant="tonal">
          Save choices
        </Button>
      </div>
      <p role="status" className={styles.text}>
        {status}
      </p>
    </form>
  );
}
