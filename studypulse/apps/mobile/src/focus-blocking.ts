// Focus blocking during study sessions (iOS Screen Time). Optional everywhere: when the
// native module or entitlement isn't available, every call is a safe no-op and
// `isFocusBlockingAvailable()` is false, so the UI can hide the option.
import { Platform } from "react-native";

import { FamilyControls } from "../modules/family-controls";

/** iOS DeviceActivity schedules must be at least 15 minutes long. */
export const MIN_FOCUS_MINUTES = 15;

export function isFocusBlockingAvailable(): boolean {
  return Platform.OS === "ios" && FamilyControls !== null;
}

/** Asks the student to allow StudyPulse to limit apps (shows the system prompt once). */
export async function requestFocusBlocking(): Promise<boolean> {
  if (!FamilyControls) return false;
  if (FamilyControls.authorizationStatus() === "approved") return true;
  return (await FamilyControls.requestAuthorization()) === "approved";
}

/**
 * Blocks distracting apps until the session ends (at least 15 minutes, so the system
 * can lift the block on its own if StudyPulse is closed). Returns false if not allowed.
 */
export function startFocusBlocking(minutes: number, now: Date = new Date()): boolean {
  if (!FamilyControls) return false;
  const length = Math.max(MIN_FOCUS_MINUTES, Math.round(minutes));
  return FamilyControls.startFocusShield(now.getTime() + length * 60_000);
}

/** Lifts the block (session stopped early or finished). Safe to call any time. */
export function stopFocusBlocking(): void {
  FamilyControls?.clearFocusShield();
}
