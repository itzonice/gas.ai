// Remembers an under-13 attempt on this browser for a day, so the age question can't
// just be answered again with a different year (launch safety S12). Storage can be
// unavailable (private mode); then there's simply no memory.
import { AGE_BLOCK_KEY, stillBlocked } from "@studypulse/core/auth";

export function recordAgeBlock(): void {
  try {
    window.localStorage.setItem(AGE_BLOCK_KEY, String(Date.now()));
  } catch {
    // ignore
  }
}

export function ageBlocked(): boolean {
  try {
    const raw = window.localStorage.getItem(AGE_BLOCK_KEY);
    return stillBlocked(raw === null ? null : Number(raw));
  } catch {
    return false;
  }
}
