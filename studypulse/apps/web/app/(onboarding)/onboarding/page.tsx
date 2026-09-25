import type { Metadata } from "next";

import { OnboardingScreen } from "@/components/onboarding/OnboardingScreen";

export const metadata: Metadata = { title: "Welcome" };

export default function OnboardingPage() {
  return <OnboardingScreen />;
}
