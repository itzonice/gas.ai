import type { Metadata } from "next";

import { TodayScreen } from "@/components/today/TodayScreen";

export const metadata: Metadata = { title: "Today" };

export default function TodayPage() {
  return <TodayScreen />;
}
