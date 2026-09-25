// Human-friendly due times in the user's timezone for notification text.
import { addDays, localDate } from "../time/index.ts";

function timeLabel(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(
    instant,
  );
}

/** "today at 11:59 PM", "tomorrow at 9:00 AM", "Fri, Mar 5 at 2:00 PM". */
export function formatDue(dueAt: Date, timeZone: string, now: Date): string {
  const today = localDate(now, timeZone);
  const day = localDate(dueAt, timeZone);
  const time = timeLabel(dueAt, timeZone);
  if (day === today) return `today at ${time}`;
  if (day === addDays(today, 1)) return `tomorrow at ${time}`;
  const date = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(dueAt);
  return `${date} at ${time}`;
}
