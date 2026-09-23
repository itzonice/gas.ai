// Shared inputs for TS/SQL parity. scripts/gen-priority-parity.ts turns these into
// supabase/tests/database/130_priority_parity.test.sql with the TS results as the
// expected values; priority.parity.test.ts fails if that file is stale.
import type { TaskStatus } from "./index.ts";

export const PRIORITY_NOW = "2027-03-01T15:00:00Z";

export const PRIORITY_FIXTURES: {
  name: string;
  gradeShare: number;
  dueInDays: number | null;
  minutesRemaining: number;
  status: TaskStatus;
  dailyMinutes: number;
}[] = [
  {
    name: "30% midterm in 5 days",
    gradeShare: 30,
    dueInDays: 5,
    minutesRemaining: 300,
    status: "todo",
    dailyMinutes: 120,
  },
  {
    name: "2% quiz tomorrow",
    gradeShare: 2,
    dueInDays: 1,
    minutesRemaining: 30,
    status: "todo",
    dailyMinutes: 120,
  },
  {
    name: "2% quiz in 3 hours",
    gradeShare: 2,
    dueInDays: 0.125,
    minutesRemaining: 30,
    status: "todo",
    dailyMinutes: 120,
  },
  {
    name: "30% final in 3 weeks",
    gradeShare: 30,
    dueInDays: 21,
    minutesRemaining: 300,
    status: "todo",
    dailyMinutes: 120,
  },
  {
    name: "heavy work no longer fits",
    gradeShare: 10,
    dueInDays: 4,
    minutesRemaining: 600,
    status: "todo",
    dailyMinutes: 120,
  },
  {
    name: "in progress",
    gradeShare: 10,
    dueInDays: 3,
    minutesRemaining: 60,
    status: "in_progress",
    dailyMinutes: 120,
  },
  {
    name: "in progress capped",
    gradeShare: 40,
    dueInDays: -2,
    minutesRemaining: 60,
    status: "in_progress",
    dailyMinutes: 120,
  },
  {
    name: "overdue",
    gradeShare: 5,
    dueInDays: -1,
    minutesRemaining: 60,
    status: "todo",
    dailyMinutes: 120,
  },
  {
    name: "undated",
    gradeShare: 5,
    dueInDays: null,
    minutesRemaining: 60,
    status: "todo",
    dailyMinutes: 120,
  },
  {
    name: "done",
    gradeShare: 30,
    dueInDays: 1,
    minutesRemaining: 0,
    status: "done",
    dailyMinutes: 120,
  },
  {
    name: "skipped",
    gradeShare: 30,
    dueInDays: 1,
    minutesRemaining: 0,
    status: "skipped",
    dailyMinutes: 120,
  },
  {
    name: "low daily capacity",
    gradeShare: 15,
    dueInDays: 6,
    minutesRemaining: 240,
    status: "todo",
    dailyMinutes: 30,
  },
  {
    name: "zero share",
    gradeShare: 0,
    dueInDays: 2,
    minutesRemaining: 45,
    status: "todo",
    dailyMinutes: 90,
  },
];
