import type { Metadata } from "next";

import { ReviewScreen } from "@/components/syllabus/ReviewScreen";

export const metadata: Metadata = { title: "Review your schedule" };

export default async function ReviewPage({ params }: PageProps<"/courses/upload/[uploadId]">) {
  const { uploadId } = await params;
  return <ReviewScreen uploadId={uploadId} />;
}
