// RevenueCat SDK setup for in-app subscriptions. Purchases are identified by the
// Supabase user id (appUserID), so the revenuecat-webhook function can credit the right
// account. Entitlement checks that matter happen server-side (profiles.plan_tier); the
// SDK's customer info is only for showing the paywall state quickly.
import { PRO_ENTITLEMENT, REVENUECAT_OFFERING } from "@studypulse/core/billing";
import { Platform } from "react-native";
import Purchases, { LOG_LEVEL, type PurchasesOffering } from "react-native-purchases";

import { env } from "./env";

let configured = false;

function apiKey(): string | undefined {
  return Platform.OS === "ios"
    ? env.EXPO_PUBLIC_REVENUECAT_IOS_KEY
    : env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;
}

/** Call once at startup. No-op (returns false) when the key for this platform is unset. */
export function configurePurchases(userId: string | null): boolean {
  const key = apiKey();
  if (!key || configured) return configured;
  if (env.EXPO_PUBLIC_APP_ENV !== "production") void Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  Purchases.configure({ apiKey: key, ...(userId ? { appUserID: userId } : {}) });
  configured = true;
  return true;
}

/** Call after sign-in: purchases made before sign-in move to this account. */
export async function identifyPurchaser(userId: string): Promise<void> {
  if (!configured) return;
  await Purchases.logIn(userId);
}

/** Call on sign-out, so the next account on this device starts clean. */
export async function resetPurchaser(): Promise<void> {
  if (!configured || (await Purchases.isAnonymous())) return;
  await Purchases.logOut();
}

/** The Pro offering (monthly and annual packages), or null if unavailable. */
export async function proOffering(): Promise<PurchasesOffering | null> {
  if (!configured) return null;
  const offerings = await Purchases.getOfferings();
  return offerings.all[REVENUECAT_OFFERING] ?? offerings.current;
}

/** Whether the store says this device's account has Pro right now (display only). */
export async function hasProOnDevice(): Promise<boolean> {
  if (!configured) return false;
  const info = await Purchases.getCustomerInfo();
  return PRO_ENTITLEMENT in info.entitlements.active;
}
