import type { Metadata } from "next";

import { Placeholder } from "@/components/page/Placeholder";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return <Placeholder title="Settings" description="Account, notifications, and plan." />;
}
