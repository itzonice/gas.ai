// Where the legal pages and store subscription settings live, so the web app, the
// mobile app, emails, and store metadata all point at the same places.

/** The production web app. Override per environment with the app's own origin. */
export const DEFAULT_WEB_ORIGIN = "https://app.studypulse.app";

export function legalUrls(webOrigin: string = DEFAULT_WEB_ORIGIN) {
  const origin = webOrigin.replace(/\/+$/, "");
  return { terms: `${origin}/terms`, privacy: `${origin}/privacy` };
}

/** Where users manage (and cancel) a subscription bought in an app store. */
export const STORE_SUBSCRIPTION_URLS = {
  app_store: "https://apps.apple.com/account/subscriptions",
  play_store: "https://play.google.com/store/account/subscriptions",
} as const;
