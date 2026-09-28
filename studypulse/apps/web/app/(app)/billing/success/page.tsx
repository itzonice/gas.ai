import type { Metadata } from "next";

import { UpgradeScreen } from "@/components/upgrade/UpgradeScreen";

export const metadata: Metadata = { title: "Welcome to Pro" };

// Where Stripe Checkout returns after payment; Pro turns on when the webhook lands.
export default function BillingSuccessPage() {
  return <UpgradeScreen returned="success" />;
}
