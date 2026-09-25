import type { Metadata } from "next";

import { Placeholder } from "@/components/page/Placeholder";

export const metadata: Metadata = { title: "Focus" };

export default function FocusPage() {
  return <Placeholder title="Focus" description="Study with a timer." />;
}
