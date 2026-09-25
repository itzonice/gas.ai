import type { Metadata } from "next";

import { FocusScreen } from "@/components/focus/FocusScreen";

export const metadata: Metadata = { title: "Focus" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuidParam(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && UUID.test(value) ? value : undefined;
}

// Links: /focus?start=1&assignment=<id> (from a task) and /focus?block=<id> (a review block).
export default async function FocusPage({ searchParams }: PageProps<"/focus">) {
  const params = await searchParams;
  const assignmentId = uuidParam(params.assignment);
  const blockId = uuidParam(params.block);
  return (
    <FocusScreen
      {...(assignmentId ? { assignmentId } : {})}
      {...(blockId ? { blockId } : {})}
      autoStart={params.start === "1"}
    />
  );
}
