# Product analytics

StudyPulse sends a small set of product events to PostHog, all from the server. Database
triggers record each event in the `analytics_events` outbox in the same transaction as the
action, and the `flush-analytics` function sends them to PostHog every 5 minutes. Events
are never lost if PostHog is down (they wait and retry), and never double-counted (the
outbox row id is the PostHog event `uuid`).

Events identify users by their StudyPulse user id only. They never include emails, names,
course or assignment titles, grades, or syllabus text.

## Events

| Event              | When                                                     | Properties                                                                                                   |
| ------------------ | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `signed_up`        | A profile is created                                     | —                                                                                                            |
| `syllabus_parsed`  | An upload finishes parsing                               | `source` (pdf, image, text, url), `extraction_method`, `page_count`, `assignments_found`, `seconds_to_parse` |
| `course_committed` | The student saves a parsed syllabus as a course          | `source`, `assignments`, `categories`                                                                        |
| `session_logged`   | A study session is stopped (or logged with an end time)  | `minutes`, `source` (timer, manual), `has_assignment`                                                        |
| `upgraded`         | The user becomes Pro                                     | `provider` (stripe, revenuecat), `store`                                                                     |
| `activated`        | The user meets the activation definition (once per user) | `hours_since_signup`                                                                                         |

Every event also carries `environment` (development, preview, production); filter
insights to `production`.

## Activation metric

**A new user is activated when, within 7 days of signing up, they have committed at least
one course from a syllabus and logged at least one study session.**

Why these two: committing a course is the moment StudyPulse has the student's real
deadlines (everything else, from the Today feed to reminders, depends on it), and logging
a session shows they used it to actually study rather than just look. Either one alone
predicts little: plenty of students parse a syllabus and never return, and a session
without a course means nothing is being planned. The 7-day window keeps the metric about
onboarding rather than eventual use.

It's computed in the database, not in a PostHog query: the first time both milestones
exist inside the window, an `activated` event is recorded (a unique index guarantees one
per user). Milestones reached after day 7 don't count.

**Activation rate** = users with `activated` ÷ users with `signed_up`, by signup cohort
(week). In PostHog:

1. Funnel: `signed_up` → `activated`, conversion window 7 days, breakdown by week of first
   `signed_up`. This is the headline number.
2. Funnel for diagnosis: `signed_up` → `syllabus_parsed` → `course_committed` →
   `session_logged`, window 7 days. Shows where new users drop off.
3. Trend: weekly count of `activated`, and `upgraded` among activated vs. not activated
   users (the case for making activation the north star).

## Operations

- Set `POSTHOG_API_KEY` (project API key, `phc_…`) and `POSTHOG_HOST` for the functions.
  Without them, events queue in the outbox and are sent once the key is set.
- Sent events are kept 30 days, then deleted. Events that fail 10 times are dropped after
  30 days (check the function logs if that ever happens).
- Account deletion removes the user's outbox rows. Events already in PostHog are keyed by
  the user id only; to erase them too, delete the person in PostHog (Persons, then Delete
  person, or the API with a personal key).
