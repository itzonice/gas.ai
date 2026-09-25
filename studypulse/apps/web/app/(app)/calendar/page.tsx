import type { Metadata } from "next";

import { Placeholder } from "@/components/page/Placeholder";

export const metadata: Metadata = { title: "Calendar" };

export default function CalendarPage() {
  return <Placeholder title="Calendar" description="Every deadline and study block." />;
}
