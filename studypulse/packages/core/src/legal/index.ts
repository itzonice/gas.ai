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

/** Where users manage (and cancel) a subscription bought in an app store. */
export const STORE_SUBSCRIPTION_URLS = {
  app_store: "https://apps.apple.com/account/subscriptions",
  play_store: "https://play.google.com/store/account/subscriptions",
} as const;
