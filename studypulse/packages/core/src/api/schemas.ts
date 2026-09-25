// zod schemas for API inputs. The server validates again; these give fast, field-level
// errors in the client and keep web and mobile in agreement.
import { z } from "zod";

import { MAX_CARD_COUNT, MAX_NOTES_CHARS, MIN_NOTES_CHARS } from "../cards/notes.ts";
import { SYLLABUS_MAX_BYTES } from "../parser/file-type.ts";
import { ASSIGNMENT_KINDS } from "../parser/prompts/v1/schema.ts";

export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
export const uuidSchema = z.uuid();

const termHints = { term_start: isoDateSchema.optional(), term_end: isoDateSchema.optional() };

export const uploadSyllabusInputSchema = z.discriminatedUnion("source", [
  z.object({
    source: z.literal("file"),
    file_path: z.string().min(3).max(300),
    original_filename: z.string().trim().min(1).max(255).optional(),
    ...termHints,
  }),
  z.object({
    source: z.literal("text"),
    text: z
      .string()
      .trim()
      .min(200, "Paste the whole syllabus (at least a few paragraphs)")
      .max(200_000),
    ...termHints,
  }),
  z.object({
    source: z.literal("url"),
    url: z.url({ protocol: /^https?$/ }).max(2048),
    ...termHints,
  }),
]);
export type UploadSyllabusInput = z.infer<typeof uploadSyllabusInputSchema>;

/** A syllabus file picked on the device, before it goes to storage. */
export const SYLLABUS_UPLOAD_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
export const uploadSyllabusFileInputSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  type: z.enum(SYLLABUS_UPLOAD_TYPES, {
    error: "Upload a PDF or a photo (PNG, JPEG, or WebP)",
  }),
  size: z
    .number()
    .int()
    .positive("The file is empty")
    .max(SYLLABUS_MAX_BYTES, "The file is larger than 20 MB"),
  term_start: isoDateSchema.optional(),
  term_end: isoDateSchema.optional(),
});
export type UploadSyllabusFileInput = z.input<typeof uploadSyllabusFileInputSchema>;

export const todayFeedInputSchema = z.object({ date: isoDateSchema.optional() }).default({});
export type TodayFeedInput = z.infer<typeof todayFeedInputSchema>;

const numeric = z.coerce.number();

/**
 * One row of get_today_feed(): review items (item_type "review": exam reviews, exam prep,
 * practice quizzes) come first, then ranked tasks. Review rows have no assignment kind,
 * status, grade share, or priority; practice quizzes have no assignment.
 */
export const todayFeedRowSchema = z.object({
  item_type: z.enum(["review", "task"]),
  item_id: uuidSchema,
  assignment_id: uuidSchema.nullable(),
  course_id: uuidSchema,
  course_name: z.string(),
  title: z.string(),
  kind: z.enum(ASSIGNMENT_KINDS).nullable(),
  status: z.enum(["todo", "in_progress", "done", "skipped"]).nullable(),
  block_kind: z.enum(["study", "review", "exam_prep", "practice_quiz"]).nullable(),
  block_status: z.enum(["planned", "done", "missed"]).nullable(),
  starts_at: z.string().nullable(),
  ends_at: z.string().nullable(),
  due_at: z.string().nullable(),
  grade_share: numeric.nullable(),
  minutes_remaining: z.number().int(),
  planned_minutes: z.number().int(),
  priority: numeric.nullable(),
  overdue: z.boolean(),
  rank: z.number().int(),
  capacity_minutes: z.number().int(),
  studied_minutes: z.number().int(),
});
export type TodayFeedRow = z.infer<typeof todayFeedRowSchema>;

const courseChipSchema = z.object({
  id: uuidSchema,
  code: z.string(),
  name: z.string(),
  color: z.string().nullable(),
});

/** Response of get_today_overview(): the Today screen's metrics, reviews, and next exam. */
export const todayOverviewSchema = z.object({
  timezone: z.string(),
  today: isoDateSchema,
  week_start: isoDateSchema,
  due_this_week: z.number().int(),
  focus_minutes_this_week: z.number().int(),
  courses_at_risk: z.array(
    z.object({ id: uuidSchema, code: z.string(), current: z.number(), target: z.number() }),
  ),
  reviews: z.array(
    z.object({
      id: uuidSchema,
      kind: z.enum(["review", "exam_prep"]),
      status: z.enum(["planned", "done", "missed"]),
      starts_at: z.string(),
      ends_at: z.string(),
      minutes: z.number().int(),
      course_id: uuidSchema,
      assignment_id: uuidSchema.nullable(),
      title: z.string(),
    }),
  ),
  next_exam: z
    .object({
      id: uuidSchema,
      title: z.string(),
      course_id: uuidSchema,
      due_at: z.string(),
      days_until: z.number().int(),
    })
    .nullable(),
  courses: z.array(courseChipSchema),
});
export type TodayOverview = z.infer<typeof todayOverviewSchema>;

/** Response of get_courses_overview(): one entry per active course, for the course cards. */
export const coursesOverviewSchema = z.object({
  timezone: z.string(),
  courses: z.array(
    z.object({
      id: uuidSchema,
      name: z.string(),
      code: z.string().nullable(),
      color: z.string().nullable(),
      instructor: z.string().nullable(),
      target_grade: z.coerce.number().nullable(),
      current_grade: z.coerce.number().nullable(),
      letter: z.string().nullable(),
      open_count: z.number().int(),
      next_due: z
        .object({ id: uuidSchema, title: z.string(), kind: z.string(), due_at: z.string() })
        .nullable(),
    }),
  ),
});
export type CoursesOverview = z.infer<typeof coursesOverviewSchema>;
export type CourseCard = CoursesOverview["courses"][number];

const focusCourseFields = {
  course_id: uuidSchema,
  course_code: z.string().nullable(),
  course_name: z.string(),
  course_color: z.string().nullable(),
};

/** Response of get_focus_overview(): metric cards, the running session, and history. */
export const focusOverviewSchema = z.object({
  timezone: z.string(),
  today: isoDateSchema,
  today_minutes: z.number().int(),
  streak_days: z.number().int(),
  running: z
    .object({
      id: uuidSchema,
      started_at: z.string(),
      assignment_id: uuidSchema.nullable(),
      title: z.string(),
      ...focusCourseFields,
    })
    .nullable(),
  linked: z
    .object({
      block_id: uuidSchema.nullable(),
      block_kind: z.string().nullable(),
      block_minutes: z.number().int().nullable(),
      assignment_id: uuidSchema.nullable(),
      title: z.string(),
      due_at: z.string().nullable(),
      ...focusCourseFields,
    })
    .nullable(),
  choices: z.array(
    z.object({
      assignment_id: uuidSchema,
      title: z.string(),
      due_at: z.string().nullable(),
      ...focusCourseFields,
    }),
  ),
  courses: z.array(
    z.object({
      id: uuidSchema,
      code: z.string().nullable(),
      name: z.string(),
      color: z.string().nullable(),
    }),
  ),
  history: z.array(
    z.object({
      id: uuidSchema,
      started_at: z.string(),
      ended_at: z.string(),
      minutes: z.number().int(),
      assignment_id: uuidSchema.nullable(),
      title: z.string(),
      ...focusCourseFields,
    }),
  ),
});
export type FocusOverview = z.infer<typeof focusOverviewSchema>;

export const focusOverviewInputSchema = z.object({
  assignmentId: uuidSchema.optional(),
  blockId: uuidSchema.optional(),
});
export type FocusOverviewInput = z.infer<typeof focusOverviewInputSchema>;

/** Response of get_stats_overview(): focus minutes against grade per course. */
export const statsOverviewSchema = z.object({
  timezone: z.string(),
  today: isoDateSchema,
  week_start: isoDateSchema,
  period_start: isoDateSchema,
  weeks: z.number().int(),
  this_week_minutes: z.number().int(),
  weekly: z.array(z.object({ week_start: isoDateSchema, minutes: z.number().int() })),
  average_grade: z.coerce.number().nullable(),
  courses: z.array(
    z.object({
      id: uuidSchema,
      code: z.string().nullable(),
      name: z.string(),
      color: z.string().nullable(),
      target_grade: z.coerce.number().nullable(),
      current_grade: z.coerce.number().nullable(),
      letter: z.string().nullable(),
      focus_minutes: z.number().int(),
    }),
  ),
});
export type StatsOverview = z.infer<typeof statsOverviewSchema>;
export const statsWeeksSchema = z.number().int().min(1).max(26);

const hhmmSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24-hour)");

/** Response of get_settings() plus the sign-in email from the session. */
export const settingsSchema = z.object({
  email: z.string().nullable(),
  profile: z.object({
    display_name: z.string().nullable(),
    school: z.string().nullable(),
    timezone: z.string(),
    daily_study_minutes: z.number().int(),
    study_start_time: hhmmSchema,
    card_tasks_enabled: z.boolean(),
    plan_tier: z.enum(["free", "pro"]),
    onboarded_at: z.string().nullable(),
  }),
  notifications: z.object({
    push_enabled: z.boolean(),
    email_digest_enabled: z.boolean(),
    remind_24h: z.boolean(),
    remind_2h: z.boolean(),
    exam_countdown: z.boolean(),
    morning_digest: z.boolean(),
    morning_digest_time: hhmmSchema,
    quiet_hours_enabled: z.boolean(),
    quiet_hours_start: hhmmSchema,
    quiet_hours_end: hhmmSchema,
    daily_cap: z.number().int(),
  }),
  devices: z.object({ mobile: z.number().int(), web: z.number().int() }),
});
export type Settings = z.infer<typeof settingsSchema>;
export type NotificationPrefs = Settings["notifications"];

const timezoneSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_+\-/]+$/, "Choose a timezone from the list");

export const profileUpdateSchema = z
  .object({
    displayName: z.string().trim().max(100).nullable(),
    school: z.string().trim().max(200).nullable(),
    timezone: timezoneSchema,
    dailyStudyMinutes: z.number().int().min(0).max(960),
    studyStartTime: hhmmSchema,
    cardTasksEnabled: z.boolean(),
  })
  .partial();
export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;

export const notificationPrefsUpdateSchema = z
  .object({
    push_enabled: z.boolean(),
    email_digest_enabled: z.boolean(),
    remind_24h: z.boolean(),
    remind_2h: z.boolean(),
    exam_countdown: z.boolean(),
    morning_digest: z.boolean(),
    morning_digest_time: hhmmSchema,
    quiet_hours_enabled: z.boolean(),
    quiet_hours_start: hhmmSchema,
    quiet_hours_end: hhmmSchema,
    daily_cap: z.number().int().min(1).max(50),
  })
  .partial();
export type NotificationPrefsUpdate = z.infer<typeof notificationPrefsUpdateSchema>;

export const onboardingInputSchema = z.object({
  displayName: z.string().trim().max(100),
  timezone: timezoneSchema,
  dailyStudyMinutes: z.number().int().min(15).max(960),
  studyStartTime: hhmmSchema,
});
export type OnboardingInput = z.infer<typeof onboardingInputSchema>;

/** Response of the `features` edge function. */
export const featuresResponseSchema = z.object({
  features: z.object({
    ai: z.boolean(),
    stripe: z.boolean(),
    revenuecat: z.boolean(),
    email: z.boolean(),
    webPush: z.boolean(),
    googleCalendar: z.boolean(),
  }),
});
export type Features = z.infer<typeof featuresResponseSchema>["features"];

export const courseTargetInputSchema = z.object({
  courseId: uuidSchema,
  targetGrade: z.number().min(0).max(100).nullable(),
});
export type CourseTargetInput = z.infer<typeof courseTargetInputSchema>;

export const calendarRangeInputSchema = z
  .object({ from: isoDateSchema, to: isoDateSchema })
  .refine((r) => r.to >= r.from, { message: "End date is before start date", path: ["to"] })
  // Same limit as get_calendar(): a month view plus its leading and trailing days.
  .refine((r) => Date.parse(r.to) - Date.parse(r.from) <= 62 * 86_400_000, {
    message: "Show at most 62 days at a time",
    path: ["to"],
  });
export type CalendarRangeInput = z.infer<typeof calendarRangeInputSchema>;

/** Response of get_calendar(): items tagged with their local date, plus course chips. */
export const calendarRangeSchema = z.object({
  timezone: z.string(),
  today: isoDateSchema,
  from: isoDateSchema,
  to: isoDateSchema,
  items: z.array(
    z.object({
      type: z.enum(["due", "study"]),
      id: uuidSchema,
      title: z.string(),
      kind: z.string(),
      status: z.string(),
      course_id: uuidSchema,
      date: isoDateSchema,
      starts_at: z.string(),
      ends_at: z.string().nullable(),
      overdue: z.boolean(),
    }),
  ),
  courses: z.array(courseChipSchema),
});
export type CalendarRange = z.infer<typeof calendarRangeSchema>;
export type CalendarItem = CalendarRange["items"][number];

export const blockStatusInputSchema = z.object({
  id: uuidSchema,
  status: z.enum(["planned", "done", "missed"]),
});
export type BlockStatusInput = z.infer<typeof blockStatusInputSchema>;

export const exportCardsInputSchema = z.object({
  courseId: uuidSchema,
  format: z.enum(["anki", "quizlet"]).default("anki"),
});
export type ExportCardsInput = z.input<typeof exportCardsInputSchema>;

export const generateCardsRequestSchema = z.object({
  courseId: uuidSchema,
  /** A "Make 5–20 cards" task (or any assignment) the cards belong to. */
  assignmentId: uuidSchema.optional(),
  notes: z
    .string()
    .trim()
    .min(MIN_NOTES_CHARS, "Add a few more lines of notes first")
    .max(MAX_NOTES_CHARS, "Notes are too long; split them into parts"),
  maxCards: z.number().int().min(1).max(MAX_CARD_COUNT).optional(),
});
export type GenerateCardsRequest = z.input<typeof generateCardsRequestSchema>;

export interface GeneratedCardsResponse {
  cards: { id: string; front: string; back: string; tags: string[] }[];
  skipped_reason: string | null;
  task_completed: boolean;
}

export const startSessionInputSchema = z.object({
  /** Client-generated id; reuse it when retrying so the start is idempotent. */
  id: uuidSchema,
  courseId: uuidSchema,
  assignmentId: uuidSchema.optional(),
  /** When the timer actually started (offline starts); defaults to now on the server. */
  startedAt: z.iso.datetime({ offset: true }).optional(),
});
export type StartSessionInput = z.input<typeof startSessionInputSchema>;

export const stopSessionInputSchema = z.object({
  id: uuidSchema,
  endedAt: z.iso.datetime({ offset: true }).optional(),
});
export type StopSessionInput = z.input<typeof stopSessionInputSchema>;

const assignmentFields = {
  title: z.string().trim().min(1).max(300),
  kind: z.enum(ASSIGNMENT_KINDS),
  categoryId: uuidSchema.nullable(),
  description: z.string().max(10_000).nullable(),
  /** UTC instant (ISO 8601 with offset). */
  dueAt: z.iso.datetime({ offset: true }).nullable(),
  pointsPossible: z.number().positive().max(100_000).nullable(),
  pointsEarned: z.number().min(0).max(200_000).nullable(),
  estimatedMinutes: z.number().int().positive().max(10_080).nullable(),
  status: z.enum(["todo", "in_progress", "done", "skipped"]),
};

export const createAssignmentInputSchema = z
  .object({ courseId: uuidSchema, ...assignmentFields })
  .partial({
    kind: true,
    categoryId: true,
    description: true,
    dueAt: true,
    pointsPossible: true,
    pointsEarned: true,
    estimatedMinutes: true,
    status: true,
  })
  .refine((a) => a.pointsEarned == null || a.pointsPossible != null, {
    message: "Add points possible before entering a score",
    path: ["pointsEarned"],
  });
export type CreateAssignmentInput = z.input<typeof createAssignmentInputSchema>;

export const updateAssignmentInputSchema = z
  .object({ id: uuidSchema, ...assignmentFields })
  .partial()
  .required({ id: true })
  .refine((a) => Object.keys(a).length > 1, { message: "Nothing to update" });
export type UpdateAssignmentInput = z.input<typeof updateAssignmentInputSchema>;

export const registerPushTokenInputSchema = z
  .object({
    provider: z.enum(["expo", "web_push"]),
    token: z.string().min(1).max(2048),
    platform: z.enum(["ios", "android", "web"]),
    deviceId: z.string().max(200).optional(),
    appVersion: z.string().max(50).optional(),
    webPushKeys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }).optional(),
  })
  .refine(
    (t) => t.provider !== "expo" || /^(Exponent|Expo)PushToken\[[A-Za-z0-9_-]+\]$/.test(t.token),
    {
      message: "Not an Expo push token",
      path: ["token"],
    },
  )
  .refine(
    (t) =>
      t.provider !== "web_push" || (t.webPushKeys !== undefined && t.token.startsWith("https://")),
    {
      message: "Web push needs the subscription endpoint and keys",
      path: ["webPushKeys"],
    },
  );

/** Every list endpoint returns pages of at most 100 rows (PostgREST max_rows is 100 too). */
export const MAX_PAGE_SIZE = 100;
export const pageInputSchema = z.object({
  limit: z.number().int().min(1).max(MAX_PAGE_SIZE).default(50),
  offset: z.number().int().min(0).max(10_000).default(0),
});
export type PageInput = z.input<typeof pageInputSchema>;
export interface Page<T> {
  items: T[];
  /** Pass as `offset` for the next page; null when this was the last one. */
  nextOffset: number | null;
}

export const assignmentListInputSchema = pageInputSchema.extend({
  courseId: uuidSchema.optional(),
});
export type AssignmentListInput = z.input<typeof assignmentListInputSchema>;

/** A birth month, "YYYY-MM" (launch safety S12 age gate). */
export const birthMonthSchema = z.string().regex(/^(19|20)\d{2}-(0[1-9]|1[0-2])$/, "Use YYYY-MM");
export const ageResultSchema = z.enum(["confirmed", "blocked"]);
