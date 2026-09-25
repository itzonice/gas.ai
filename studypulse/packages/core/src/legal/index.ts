// Where the legal pages and store subscription settings live, so the web app, the
// mobile app, emails, and store metadata all point at the same places.

/** The production web app. Override per environment with the app's own origin. */
export const DEFAULT_WEB_ORIGIN = "https://app.studypulse.app";

export function legalUrls(webOrigin: string = DEFAULT_WEB_ORIGIN) {
  const origin = webOrigin.replace(/\/+$/, "");
  return {
    terms: `${origin}/terms`,
    privacy: `${origin}/privacy`,
    refunds: `${origin}/refunds`,
    copyright: `${origin}/copyright`,
    eula: `${origin}/eula`,
  };
}

/**
 * Where students get help (launch safety S19). Shown on the pricing page, in Settings,
 * in the footer links, and in every billing email. Override with NEXT_PUBLIC_SUPPORT_EMAIL
 * / EXPO_PUBLIC_SUPPORT_EMAIL (and SUPPORT_EMAIL for emails); it must be a watched inbox.
 */
export const DEFAULT_SUPPORT_EMAIL = "support@studypulse.app";

export function supportEmail(configured?: string | null): string {
  const value = configured?.trim() ?? "";
  return value === "" ? DEFAULT_SUPPORT_EMAIL : value;
}

/** Shown in place of a detail that isn't configured yet, so the gap is visible. */
export const BUSINESS_PLACEHOLDERS = {
  legalName: "[Company legal name]",
  address: "[Mailing address]",
} as const;

export interface BusinessInfo {
  legalName: string;
  address: string;
  supportEmail: string;
  /** Which details are still placeholders. */
  missing: ("legalName" | "address")[];
}

/**
 * Who sells StudyPulse and how to reach them (launch safety S28): the legal business
 * name, a physical mailing address (a PO box is fine), and the support address. Shown in
 * the site footer, on the checkout page, in the apps' settings and paywall, and in the
 * legal pages. Configure with NEXT_PUBLIC_COMPANY_LEGAL_NAME / NEXT_PUBLIC_COMPANY_ADDRESS
 * (web) and EXPO_PUBLIC_COMPANY_LEGAL_NAME / EXPO_PUBLIC_COMPANY_ADDRESS (mobile); they
 * must match COMPANY_LEGAL_NAME / COMPANY_POSTAL_ADDRESS used in emails.
 */
export function businessInfo(config: {
  legalName?: string | null;
  address?: string | null;
  supportEmail?: string | null;
}): BusinessInfo {
  const legalName = config.legalName?.trim() ?? "";
  const address = config.address?.trim() ?? "";
  const missing: BusinessInfo["missing"] = [];
  if (legalName === "") missing.push("legalName");
  if (address === "") missing.push("address");
  return {
    legalName: legalName || BUSINESS_PLACEHOLDERS.legalName,
    address: address || BUSINESS_PLACEHOLDERS.address,
    supportEmail: supportEmail(config.supportEmail),
    missing,
  };
}

/**
 * The Terms of Service in force (launch safety S21). Bump it whenever the terms change
 * materially; acceptances are recorded against it (public.terms_acceptances), and
 * private.current_terms_version() in SQL must return the same value (a test checks).
 */
export const TERMS_VERSION = "2026-09-25";

/** Where users manage (and cancel) a subscription bought in an app store. */
export const STORE_SUBSCRIPTION_URLS = {
  app_store: "https://apps.apple.com/account/subscriptions",
  play_store: "https://play.google.com/store/account/subscriptions",
} as const;
