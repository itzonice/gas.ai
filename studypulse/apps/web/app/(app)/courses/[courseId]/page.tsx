import type { Metadata } from "next";

import { CourseDetailScreen } from "@/components/courses/CourseDetailScreen";

export const metadata: Metadata = { title: "Course" };

export default async function CoursePage({ params }: PageProps<"/courses/[courseId]">) {
  const { courseId } = await params;
  return <CourseDetailScreen courseId={courseId} />;
}
