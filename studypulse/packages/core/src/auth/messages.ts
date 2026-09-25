// What sign-in, sign-up, and password-reset screens say. The wording never reveals
// whether an account exists for an email (launch safety S6): a wrong password, an
// unknown email, and an unconfirmed email read the same, and sign-up and reset always
// answer "if an account exists...".

export const AUTH_MESSAGES = {
  signInFailed: "That email and password don't match an active account. Check them and try again.",
  signUpSent:
    "Check your email. If this address can be used for a new account, we've sent a confirmation link.",
  resetSent: "If an account exists for that email, we've sent a link to reset the password.",
  rateLimited: "Too many attempts. Wait a few minutes and try again.",
  unavailable: "Couldn't reach StudyPulse. Check your connection and try again.",
} as const;

export type AuthOutcome = keyof typeof AUTH_MESSAGES;

/**
 * Maps a Supabase Auth error to what the screen shows. Everything that could hint at
 * whether the email is registered collapses into the flow's neutral message.
 */
export function authErrorMessage(
  flow: "sign-in" | "sign-up" | "reset",
  error: { status?: number | undefined; code?: string | undefined; message?: string } | null,
): string {
  if (!error)
    return flow === "sign-in"
      ? ""
      : flow === "sign-up"
        ? AUTH_MESSAGES.signUpSent
        : AUTH_MESSAGES.resetSent;
  if (
    error.status === 429 ||
    error.code === "over_request_rate_limit" ||
    error.code === "over_email_send_rate_limit"
  ) {
    return AUTH_MESSAGES.rateLimited;
  }
  if (error.status === undefined || error.status === 0 || error.status >= 500) {
    return AUTH_MESSAGES.unavailable;
  }
  if (flow === "sign-in") return AUTH_MESSAGES.signInFailed;
  // "User already registered", "email not confirmed", and the like: same as success.
  return flow === "sign-up" ? AUTH_MESSAGES.signUpSent : AUTH_MESSAGES.resetSent;
}
