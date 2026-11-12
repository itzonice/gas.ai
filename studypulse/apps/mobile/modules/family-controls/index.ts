// Native Screen Time bridge (iOS only). Null when the native module isn't in the build
// (Android, Expo Go, web, or an iOS build without the Family Controls plugin enabled).
import { requireOptionalNativeModule } from "expo-modules-core";

export type FamilyControlsAuthorization = "approved" | "denied" | "not_determined";

export interface FamilyControlsNativeModule {
  authorizationStatus(): FamilyControlsAuthorization;
  requestAuthorization(): Promise<FamilyControlsAuthorization>;
  /** Shields app and web categories until `endsAtMs`; false if not authorized. */
  startFocusShield(endsAtMs: number): boolean;
  clearFocusShield(): void;
}

export const FamilyControls =
  requireOptionalNativeModule<FamilyControlsNativeModule>("FamilyControls");
