import type { Metadata } from "next";

import { StudyScreen } from "@/components/study/StudyScreen";

export const metadata: Metadata = { title: "Study" };

export default function StudyPage() {
  return <StudyScreen />;
}
