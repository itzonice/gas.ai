import type { AssignmentKind, ParsedMeeting, ReviewItem } from "@studypulse/core/syllabus";

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

const WEEKDAY_NAMES: Record<ParsedMeeting["weekday"], string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

const MEETING_KIND_LABELS: Record<ParsedMeeting["kind"], string> = {
  lecture: "Lecture",
  lab: "Lab",
  discussion: "Discussion",
  other: "Class",
};

const clockFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  hour: "numeric",
  minute: "2-digit",
});
const at = (hhmm: string) => {
  const [h = 0, m = 0] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(2000, 0, 1, h, m));
};
const clock = (hhmm: string) => clockFormat.format(at(hhmm));

/** "Tuesday, 10:00–10:50 AM · Lecture · Hall 1". */
export function meetingText(m: ParsedMeeting): string {
  const parts = [
    `${WEEKDAY_NAMES[m.weekday]}, ${clockFormat.formatRange(at(m.start_time), at(m.end_time))}`,
    MEETING_KIND_LABELS[m.kind],
    m.location,
  ];
  return parts.filter(Boolean).join(" · ");
}

/** Short name for a remove button: "Tuesday 10:00 AM lecture". */
export function meetingName(m: ParsedMeeting): string {
  return `${WEEKDAY_NAMES[m.weekday]} ${clock(m.start_time)} ${MEETING_KIND_LABELS[m.kind].toLowerCase()}`;
}
