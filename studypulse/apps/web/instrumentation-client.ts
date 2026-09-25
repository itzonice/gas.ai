import * as Sentry from "@sentry/nextjs";

// Browser error reporting starts only once the visitor allows it (launch safety S23):
// see lib/error-reporting.ts, called by ConsentManager. Until then this is a no-op.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
