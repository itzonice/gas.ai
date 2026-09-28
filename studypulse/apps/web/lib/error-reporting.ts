// Starts browser error reporting (Sentry, through our /monitoring tunnel) once the
// visitor has allowed it (launch safety S23). Server-side reporting is unaffected.
import * as Sentry from "@sentry/nextjs";

import { sentryOptions } from "./sentry-options";

let started = false;

export function startErrorReporting(): void {
  if (started) return;
  started = true;
  Sentry.init(sentryOptions);
}

/** Withdrawn: stop sending anything more from this page. */
export function stopErrorReporting(): void {
  if (!started) return;
  started = false;
  void Sentry.close();
}
