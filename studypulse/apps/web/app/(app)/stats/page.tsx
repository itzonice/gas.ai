import type { Metadata } from "next";

import { Placeholder } from "@/components/page/Placeholder";

export const metadata: Metadata = { title: "Stats" };

export default function StatsPage() {
  return <Placeholder title="Stats" description="How your focus time and grades line up." />;
}
