import type { Metadata } from "next";

import { CoursesScreen } from "@/components/courses/CoursesScreen";

export const metadata: Metadata = { title: "Courses" };

export default function CoursesPage() {
  return <CoursesScreen />;
}
