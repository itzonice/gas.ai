import { redirect } from "next/navigation";

// Where the Stripe customer portal returns to.
export default function SettingsBillingPage() {
  redirect("/settings#plan");
}
