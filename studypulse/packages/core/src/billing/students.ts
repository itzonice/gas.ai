// Student discount eligibility. The student coupon has no public code: eligible users
// get a single-use code minted for their own Stripe customer at checkout, so the
// discount can't be shared. Eligibility is a confirmed academic email address.

/**
 * Whether an email belongs to an academic institution: *.edu, *.edu.<cc> (edu.au,
 * edu.cn, ...), *.ac.<cc> (ac.uk, ac.jp, ...), plus any extra domains configured.
 */
export function isAcademicEmail(email: string, extraDomains: readonly string[] = []): boolean {
  const at = email.lastIndexOf("@");
  if (at < 1) return false;
  const domain = email
    .slice(at + 1)
    .toLowerCase()
    .replace(/\.$/, "");
  if (!/^[a-z0-9.-]+$/.test(domain) || domain.includes("..")) return false;
  const labels = domain.split(".");
  if (labels.length < 2) return false;
  if (
    extraDomains.some((d) => domain === d.toLowerCase() || domain.endsWith(`.${d.toLowerCase()}`))
  ) {
    return true;
  }
  const tld = labels.at(-1) ?? "";
  const second = labels.at(-2) ?? "";
  if (tld === "edu") return true; // example.edu (at least two labels, checked above)
  // example.edu.au / example.ac.uk: a name before the academic second-level domain
  return (second === "edu" || second === "ac") && tld.length === 2 && labels.length >= 3;
}

/** Promotion codes tagged student_only=true (metadata) require an academic email. */
export const isStudentOnlyPromotion = (metadata: Record<string, string>) =>
  metadata.student_only === "true";

/** How long a minted student code stays valid if the user doesn't finish checkout. */
export const STUDENT_CODE_TTL_MS = 24 * 60 * 60 * 1000;
