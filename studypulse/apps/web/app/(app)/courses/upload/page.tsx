import type { Metadata } from "next";

import { UploadScreen } from "@/components/syllabus/UploadScreen";

export const metadata: Metadata = { title: "Upload a syllabus" };

export default function UploadPage() {
  return <UploadScreen />;
}
