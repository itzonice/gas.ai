// Every edge function, who may call it, and what input it reads (launch safety S30).
// endpoints.test.ts checks each function's source against this list in CI: a new
// function, or a change in how one authenticates or reads input, fails the build until
// it's declared here, and every declaration must be backed by the code:
//   - auth: the matching check is called (requireUser, requireCron, a signature or
//     shared-secret comparison, or a signed URL token);
//   - input: request data is only read through zod (parseJsonBody / parseQuery, or a
//     schema .parse after a signature check), never raw;
//   - rate limit: the function has a FUNCTION_LIMITS entry (IP limit in createHandler,
//     per-user limit in requireUser).

export type EndpointAuth =
  | "user" // Supabase JWT, via requireUser
  | "admin" // Supabase JWT plus app_metadata role "admin", via requireAdmin (S32)
  | "cron" // CRON_SECRET bearer, via requireCron
  | "oauth-state" // our single-use state on a provider's redirect back
  | "stripe-signature" // Stripe-Signature HMAC over the raw body
  | "shared-secret" // constant-time comparison with a configured secret
  | "url-token" // an unguessable or signed token in the URL is the credential
  | "public"; // anyone; must say why in `publicReason`

export type EndpointInput =
  | "json" // parseJsonBody(req, schema)
  | "query" // parseQuery(req, schema)
  | "raw-signed" // raw body read only to verify a signature, then schema .parse
  | "none"; // reads nothing from the request

export interface Endpoint {
  auth: readonly EndpointAuth[];
  input: readonly EndpointInput[];
  /** For url-token: the call in the source that checks the token. */
  tokenCheck?: string;
  /**
   * Why this endpoint accepts unknown keys (S34). Request schemas are strict otherwise:
   * only inputs from outside senders that add fields of their own stay loose.
   */
  looseInput?: string;
  publicReason?: string;
}

export const ENDPOINTS: Record<string, Endpoint> = {
  "admin-refund": { auth: ["admin"], input: ["json"] },
  "ai-cost-monitor": { auth: ["cron"], input: ["none"] },
  "calendar-feed": {
    auth: ["url-token"],
    input: ["query"],
    tokenCheck: "tokenFrom(req)",
    looseInput: "Calendar apps append their own query parameters; only the token is read.",
  },
  "canvas-oauth": {
    auth: ["user", "oauth-state"],
    input: ["json", "query"],
    looseInput: "The OAuth callback query comes from Canvas, which may add parameters.",
  },
  "canvas-sync": { auth: ["user", "cron"], input: ["json"] },
  "delete-account": { auth: ["user"], input: ["json"] },
  "email-unsubscribe": {
    auth: ["url-token"],
    input: ["query"],
    tokenCheck: "verifyUnsubscribeToken(",
    looseInput: "Mail clients and link scanners can append tracking parameters to the link.",
  },
  "export-cards": { auth: ["user"], input: ["query"] },
  "export-data": { auth: ["user"], input: ["none"] },
  features: {
    auth: ["public"],
    input: ["none"],
    publicReason: "Returns only on/off flags for optional features; no data, no variable names.",
  },
  "flush-analytics": { auth: ["cron"], input: ["none"] },
  "generate-cards": { auth: ["user"], input: ["json"] },
  "google-calendar-sync": { auth: ["user", "cron"], input: ["none"] },
  "google-oauth": {
    auth: ["user", "oauth-state"],
    input: ["query"],
    looseInput: "Google adds scope, authuser, hd, and prompt to the OAuth callback query.",
  },
  "nightly-replan": { auth: ["cron"], input: ["json"] },
  "plan-study": { auth: ["user"], input: ["none"] },
  "revenuecat-webhook": {
    auth: ["shared-secret"],
    input: ["json"],
    looseInput: "RevenueCat adds fields to its webhook payload over time.",
  },
  "send-email-digests": { auth: ["cron"], input: ["none"] },
  "send-reminders": { auth: ["cron"], input: ["none"] },
  "stripe-checkout": { auth: ["user"], input: ["json"] },
  "stripe-portal": { auth: ["user"], input: ["none"] },
  "stripe-webhook": { auth: ["stripe-signature"], input: ["raw-signed"] },
  "upload-syllabus": { auth: ["user"], input: ["json"] },
};
