// The visitor's privacy choices (launch safety S23–S24), kept in this browser and, when
// signed in, on the account (consent_log records each decision with the policy version).
import {
  CONSENT_STORAGE_KEY,
  PRIVACY_VERSION,
  type PrivacyChoices,
  type StoredChoices,
} from "@studypulse/core/privacy";

const listeners = new Set<(c: StoredChoices | null) => void>();

export function readChoices(): StoredChoices | null {
  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredChoices>;
    // A choice made under an older policy version is asked again.
    if (parsed.version !== PRIVACY_VERSION) return null;
    if (typeof parsed.analytics !== "boolean" || typeof parsed.errorReports !== "boolean") {
      return null;
    }
    return parsed as StoredChoices;
  } catch {
    return null;
  }
}

export function saveChoices(choices: PrivacyChoices): StoredChoices {
  const stored: StoredChoices = {
    ...choices,
    version: PRIVACY_VERSION,
    at: new Date().toISOString(),
  };
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Storage blocked: the choice still applies to this page view.
  }
  for (const l of listeners) l(stored);
  return stored;
}

export function onChoicesChange(listener: (c: StoredChoices | null) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
