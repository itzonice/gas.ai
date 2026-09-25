// Every table that holds data, why it's needed, whether it's personal, and how long it's
// kept (launch safety S25). docs/data-inventory.md explains it for people; a test fails if
// a table is added to the schema without an entry here. Feeds the privacy labels (App
// Store "nutrition label", Play data safety) and the privacy policy.

export interface TableInventory {
  purpose: string;
  /** Contains information about an identifiable student. */
  personal: boolean;
  retention: string;
}

const ACCOUNT = "Until the account is deleted";

export const DATA_INVENTORY: Record<string, TableInventory> = {
  "public.profiles": {
    purpose:
      "Name (optional), time zone, school (optional), study preferences, plan, consent and age-confirmation times. No birth date.",
    personal: true,
    retention: ACCOUNT,
  },
  "public.courses": { purpose: "The student's courses.", personal: true, retention: ACCOUNT },
  "public.grade_categories": {
    purpose: "Grading weights per course.",
    personal: true,
    retention: ACCOUNT,
  },
  "public.assignments": {
    purpose: "Assignments, due dates, and scores.",
    personal: true,
    retention: ACCOUNT,
  },
  "public.course_meetings": {
    purpose: "Class times, for planning and reminders.",
    personal: true,
    retention: ACCOUNT,
  },
  "public.assignment_resources": {
    purpose: "Study links the student added.",
    personal: true,
    retention: ACCOUNT,
  },
  "public.study_sessions": {
    purpose: "Focus sessions (time spent, optional notes).",
    personal: true,
    retention: ACCOUNT,
  },
  "public.study_blocks": {
    purpose: "The planned study schedule.",
    personal: true,
    retention: ACCOUNT,
  },
  "public.study_plan_alerts": {
    purpose: "Warnings that a plan doesn't fit.",
    personal: true,
    retention: "90 days",
  },
  "public.replan_requests": {
    purpose: "Queue for rebuilding a plan.",
    personal: true,
    retention: "Until processed",
  },
  "public.flashcards": { purpose: "Study cards.", personal: true, retention: ACCOUNT },
  "public.card_generations": {
    purpose: "Notes-to-cards requests and AI usage (for limits and cost).",
    personal: true,
    retention: ACCOUNT,
  },
  "public.syllabus_uploads": {
    purpose:
      "Uploaded syllabi, their extracted text, and the parse (the file is in private storage).",
    personal: true,
    retention: ACCOUNT,
  },
  "public.notification_prefs": {
    purpose: "Reminder and email choices, marketing opt-in and its time.",
    personal: true,
    retention: ACCOUNT,
  },
  "public.notification_tokens": {
    purpose: "Push addresses for the student's devices.",
    personal: true,
    retention: "Until invalid or unused for 90 days",
  },
  "public.notification_log": {
    purpose: "Sent reminders (text and delivery status), to avoid repeats and debug delivery.",
    personal: true,
    retention: "90 days",
  },
  "public.notification_dedupe": {
    purpose: "Keys that stop a reminder being sent twice.",
    personal: true,
    retention: "30 days",
  },
  "public.external_busy_times": {
    purpose: "Busy times read from Google Calendar (times only, no event details).",
    personal: true,
    retention: "30 days after they end",
  },
  "public.google_calendar_connections": {
    purpose: "Google Calendar link; tokens are encrypted in Vault.",
    personal: true,
    retention: "Until disconnected",
  },
  "public.google_calendar_events": {
    purpose: "Which calendar events StudyPulse created.",
    personal: true,
    retention: "Until disconnected",
  },
  "public.google_oauth_states": {
    purpose: "One-time sign-in state for connecting Google.",
    personal: true,
    retention: "1 day after expiry",
  },
  "public.lms_connections": {
    purpose: "Canvas link and the Canvas user's name; tokens are encrypted in Vault.",
    personal: true,
    retention: "Until disconnected",
  },
  "public.lms_dismissed_items": {
    purpose: "Canvas items the student chose to ignore.",
    personal: true,
    retention: "Until disconnected",
  },
  "public.lms_oauth_states": {
    purpose: "One-time sign-in state for connecting Canvas.",
    personal: true,
    retention: "1 day after expiry",
  },
  "public.lms_institutions": {
    purpose: "Schools' Canvas settings.",
    personal: false,
    retention: "Operational",
  },
  "public.organizations": {
    purpose: "Study groups or schools.",
    personal: false,
    retention: "Until deleted",
  },
  "public.organization_memberships": {
    purpose: "Who belongs to which group, and whether they share focus hours.",
    personal: true,
    retention: ACCOUNT,
  },
  "public.subscriptions": {
    purpose: "Plan status from Stripe, Apple, or Google.",
    personal: true,
    retention: "Account lifetime; payment records stay with the payment provider",
  },
  "public.billing_customers": {
    purpose: "The Stripe customer id.",
    personal: true,
    retention: ACCOUNT,
  },
  "public.billing_events": {
    purpose: "Processed payment webhooks (idempotency and audit).",
    personal: true,
    retention: ACCOUNT,
  },
  "public.analytics_events": {
    purpose: "Product events (no names, no course content), only with consent.",
    personal: true,
    retention: "Sent within minutes; deleted after sending",
  },
  "public.ai_cost_alerts": {
    purpose: "AI spend alerts for abuse detection.",
    personal: true,
    retention: ACCOUNT,
  },
  "public.ai_daily_caps": {
    purpose: "Daily AI spend caps per plan.",
    personal: false,
    retention: "Operational",
  },
  "public.ai_model_prices": {
    purpose: "AI model prices for cost tracking.",
    personal: false,
    retention: "Operational",
  },
  "public.terms_acceptances": {
    purpose: "Which Terms version was accepted, and when.",
    personal: true,
    retention: ACCOUNT,
  },
  "public.consent_log": {
    purpose: "Consent decisions with time and policy version.",
    personal: true,
    retention: ACCOUNT,
  },
  "private.password_attempts": {
    purpose: "Failed sign-in counter (lockout).",
    personal: true,
    retention: "15-minute windows",
  },
  "private.rate_limit_counters": {
    purpose: "Request counters by account or hashed IP.",
    personal: true,
    retention: "1 day",
  },
  "private.provider_circuits": {
    purpose: "Which outside services are paused.",
    personal: false,
    retention: "Operational",
  },
  "private.billing_disputes": {
    purpose: "Chargebacks and the evidence sent.",
    personal: true,
    retention: "Account lifetime (evidence is kept by Stripe)",
  },
  "private.content_takedowns": {
    purpose: "Copyright notices and removals.",
    personal: true,
    retention: "Kept for the repeat-infringer policy",
  },
};

/** What each outside service receives. */
export const PROCESSORS = [
  {
    name: "Supabase",
    receives: "Everything above (database, sign-in, file storage).",
    notes: "Hosting; no other use.",
  },
  {
    name: "Anthropic",
    receives: "Syllabus text or images and notes sent for cards.",
    notes: "Not used to train models (API terms).",
  },
  {
    name: "Sentry",
    receives:
      "Error details with names, emails, cookies, and credentials removed; browser reports only with consent.",
    notes: "No session replay; sendDefaultPii off.",
  },
  {
    name: "PostHog",
    receives: "Product events keyed by an internal id, with consent; no IP, no GeoIP.",
    notes: "Sent from our servers only.",
  },
  { name: "Expo", receives: "Push tokens and reminder text.", notes: "Delivery only." },
  {
    name: "RevenueCat",
    receives: "An internal user id and store purchases.",
    notes: "Mobile subscriptions.",
  },
  {
    name: "Stripe",
    receives: "Email, payment details (entered on Stripe), and an internal user id.",
    notes: "Web payments; card data never touches our servers.",
  },
  {
    name: "Resend",
    receives: "Email address and email content (digest, billing emails).",
    notes: "Delivery only.",
  },
  {
    name: "Google",
    receives:
      "Calendar access only if connected: study blocks and deadlines written, busy times read.",
    notes: "Optional.",
  },
] as const;
