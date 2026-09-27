"use client";

// Launch audit L2-AI. Before anything goes to the AI provider, the student sees who it
// is, what is sent, and why, and taps "Allow and continue" (App Store 5.1.2(i), Google
// Play user data policy). The database refuses AI requests without that consent, so this
// prompt is the friendly path, not the enforcement.
import { AI_DISCLOSURE as AI } from "@studypulse/core/privacy";
import { useState } from "react";

import { useApi } from "@/components/auth/SessionProvider";
import { Button, CheckboxField, Dialog } from "@/components/ui";

import styles from "./privacy.module.css";

/** The disclosure itself, shared by the prompt and Settings. */
export function AiDisclosure() {
  return (
    <div className={styles.disclosure}>
      <p className={styles.text}>{AI.purpose}</p>
      <p className={styles.text}>
        <strong>What is sent to {AI.provider}:</strong>
      </p>
      <ul className={styles.list}>
        {AI.sent.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <p className={styles.text}>{AI.notSent}</p>
      <p className={styles.text}>
        {AI.use}{" "}
        <a href={AI.providerUrl} target="_blank" rel="noreferrer">
          {AI.provider}&apos;s privacy policy
        </a>
      </p>
      <p className={styles.text}>{AI.accuracy}</p>
      <p className={styles.text}>{AI.choice}</p>
    </div>
  );
}

/**
 * The prompt shown before the first AI request. `onAllowed` runs after consent is saved;
 * "Not now" just closes it and sends nothing.
 */
export function AiConsentDialog({
  open,
  onClose,
  onAllowed,
}: {
  open: boolean;
  onClose: () => void;
  onAllowed: () => void;
}) {
  const api = useApi();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function allow() {
    setSaving(true);
    setError(null);
    try {
      await api.privacy.setAiConsent(true, "prompt");
      onAllowed();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save your choice. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      labelledBy="ai-consent-title"
      title={AI.title}
      footer={
        <>
          <Button variant="text" onClick={onClose}>
            {AI.decline}
          </Button>
          <Button variant="filled" onClick={() => void allow()} disabled={saving}>
            {saving ? "Saving…" : AI.allow}
          </Button>
        </>
      }
    >
      <AiDisclosure />
      {error ? (
        <p role="alert" className={styles.text}>
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}

/** The Settings switch: withdraw or give consent at any time. Saves right away. */
export function AiConsentSetting({ initial }: { initial: boolean }) {
  const api = useApi();
  const [allowed, setAllowed] = useState(initial);
  const [status, setStatus] = useState("");

  async function change(next: boolean) {
    const previous = allowed;
    setAllowed(next);
    setStatus("");
    try {
      await api.privacy.setAiConsent(next, "settings");
      setStatus(
        next
          ? "On. Syllabi and notes you submit are sent to Anthropic to be read."
          : "Off. Nothing new is sent to Anthropic. You can still add courses by hand.",
      );
    } catch {
      setAllowed(previous);
      setStatus("Couldn't save that. Try again.");
    }
  }

  return (
    <div className={styles.form}>
      <CheckboxField
        label={AI.settingLabel}
        hint={AI.settingHint}
        checked={allowed}
        onChange={(e) => void change(e.target.checked)}
      />
      <details>
        <summary className={styles.summary}>What this means</summary>
        <AiDisclosure />
      </details>
      <p role="status" className={styles.text}>
        {status}
      </p>
    </div>
  );
}
