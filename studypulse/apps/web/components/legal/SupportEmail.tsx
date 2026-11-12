// The support address as a mailto link (launch safety S19).
import { supportEmail } from "@studypulse/core/legal";

// Referenced literally so Next inlines it; not through publicEnv, so legal pages and tests
// render without the rest of the environment.
const configured = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;

export function SupportEmail() {
  const email = supportEmail(configured);
  return <a href={`mailto:${email}`}>{email}</a>;
}
