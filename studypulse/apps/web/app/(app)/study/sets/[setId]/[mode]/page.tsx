import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ModeScreen } from "@/components/study/ModeScreen";
import { STUDY_MODES } from "@studypulse/core/study";

export const metadata: Metadata = { title: "Study" };

export default async function ModePage({ params }: PageProps<"/study/sets/[setId]/[mode]">) {
  const { setId, mode } = await params;
  const known = STUDY_MODES.find((m) => m.id === mode);
  if (!known) notFound();
  return <ModeScreen setId={setId} mode={known.id} />;
}
