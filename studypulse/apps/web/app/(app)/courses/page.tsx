import type { Metadata } from "next";

import { Placeholder } from "@/components/page/Placeholder";

export const metadata: Metadata = { title: "Courses" };

export default function CoursesPage() {
  return <Placeholder title="Courses" description="Your courses, grades, and syllabi." />;
}
