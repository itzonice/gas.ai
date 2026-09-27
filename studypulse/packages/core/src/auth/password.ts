// Password rules (launch safety S34). Supabase Auth enforces them (config.toml
// minimum_password_length, plus leaked-password protection in production); the apps check
// the same length first so students get the message before submitting.

/** Must match `minimum_password_length` in supabase/config.toml (a test checks). */
export const PASSWORD_MIN_LENGTH = 10;
/** bcrypt ignores anything past 72 bytes; refuse longer passwords rather than truncate. */
export const PASSWORD_MAX_LENGTH = 72;

export const PASSWORD_HINT = `At least ${String(PASSWORD_MIN_LENGTH)} characters.`;

/** A problem with a new password, or null if it's acceptable to send. */
export function passwordProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Use at least ${String(PASSWORD_MIN_LENGTH)} characters.`;
  }
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_LENGTH) {
    return `Use at most ${String(PASSWORD_MAX_LENGTH)} characters.`;
  }
  return null;
}

/** Supabase Auth refused the password as too short or found in a known data breach. */
export function isWeakPasswordError(error: { code?: string | undefined } | null): boolean {
  return error?.code === "weak_password";
}
