import type { Metadata } from "next";

import { AgeCheck } from "@/components/onboarding/AgeCheck";
import { OnboardingScreen } from "@/components/onboarding/OnboardingScreen";

export const metadata: Metadata = { title: "Welcome" };

export default function OnboardingPage() {
  return (
    <AgeCheck>
      <OnboardingScreen />
    </AgeCheck>
  );
}
