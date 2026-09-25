import type { AssignmentKind, ReviewItem } from "@studypulse/core/syllabus";

export const KIND_LABELS: Record<AssignmentKind, string> = {
  assignment: "Assignment",
  quiz: "Quiz",
  exam: "Exam",
  project: "Project",
  reading: "Reading",
  lab: "Lab",
  discussion: "Discussion",
  other: "Other",
};

/** "Wed, Feb 9 at 9:00 AM", "Wed, Feb 9 at 11:59 PM", or "No date". Local calendar values. */
export function itemDateText(item: Pick<ReviewItem, "due_date" | "due_time">): string {
  if (!item.due_date) return "No date";
  const [h = 23, m = 59] = (item.due_time ?? "23:59").split(":").map(Number);
  const date = new Date(`${item.due_date}T00:00:00Z`);
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(Date.UTC(2000, 0, 1, h, m)));
  return `${day} at ${time}`;
}
