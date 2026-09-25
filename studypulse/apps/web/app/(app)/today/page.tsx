import type { Metadata } from "next";

import { Placeholder } from "@/components/page/Placeholder";

export const metadata: Metadata = { title: "Today" };

export default function TodayPage() {
  return (
    <Placeholder title="Today" description="What's due, what to review, and what to do next." />
  );
}
