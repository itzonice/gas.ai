import { redirect } from "next/navigation";

// Where Stripe Checkout returns when the user cancels.
export default function BillingPage() {
  redirect("/upgrade?canceled=1");
}
