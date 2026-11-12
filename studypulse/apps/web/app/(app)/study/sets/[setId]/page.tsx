import type { Metadata } from "next";

import { SetScreen } from "@/components/study/SetScreen";

export const metadata: Metadata = { title: "Card set" };

export default async function SetPage({ params }: PageProps<"/study/sets/[setId]">) {
  const { setId } = await params;
  return <SetScreen setId={setId} />;
}
