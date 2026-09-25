// Redacts credentials and personal data that show up inside free text: log messages,
// error messages, URLs, and breadcrumbs. Key-based redaction (`redactSensitive`) can't
// see a token that was interpolated into a string, so every string goes through here too.

const REDACTED = "[redacted]";
const EMAIL = "[email]";

const RULES: { re: RegExp; replace: string | ((match: string, ...groups: string[]) => string) }[] =
  [
    // user:password@ in any URL. Before the email rule, which would match "password@host".
    { re: /\b([a-z][a-z0-9+.-]*:\/\/)[^\s/?#@:]+:[^\s/?#@]+@/gi, replace: `$1${REDACTED}@` },
    // JWTs (Supabase access, refresh, and service-role tokens).
    { re: /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g, replace: REDACTED },
    // Authorization header values.
    { re: /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, replace: `$1 ${REDACTED}` },
    // Stripe secret and restricted keys, and webhook secrets.
    { re: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{8,}/g, replace: REDACTED },
    { re: /\bwhsec_[A-Za-z0-9]{8,}/g, replace: REDACTED },
    // Anthropic API keys.
    { re: /\bsk-ant-[A-Za-z0-9_-]{8,}/g, replace: REDACTED },
    // Resend API keys.
    { re: /\bre_[A-Za-z0-9_]{16,}/g, replace: REDACTED },
    // Tokens and OAuth values in URLs and bare query strings (ICS feed, unsubscribe,
    // OAuth callbacks).
    {
      re: /((?:^|[?&])(?:token|access_token|refresh_token|code|state|key|secret|signature)=)[^&#\s"']+/gi,
      replace: `$1${REDACTED}`,
    },
    // Email addresses.
    { re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g, replace: EMAIL },
    // Opaque tokens: 40+ characters of letters and digits (mixed), e.g. calendar-feed and
    // unsubscribe tokens. UUIDs are 36 characters and stay readable.
    {
      re: /(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{40,}(?![A-Za-z0-9_-])/g,
      replace: (m) => (/[0-9]/.test(m) && /[A-Za-z]/.test(m) ? REDACTED : m),
    },
  ];

/** Replaces credentials, tokens, and email addresses inside a string. */
export function redactText(text: string): string {
  let out = text;
  for (const { re, replace } of RULES) {
    out = typeof replace === "string" ? out.replace(re, replace) : out.replace(re, replace);
  }
  return out;
}
