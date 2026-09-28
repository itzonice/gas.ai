# Changelog

Notable changes to StudyPulse (web, mobile, and backend), newest first. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the apps use
[semantic versioning](https://semver.org/).

## How releases work

- **Version numbers.** The mobile version is `expo.version` in `apps/mobile/app.json`
  (what the stores show). EAS sets build numbers (`appVersionSource: remote`,
  `autoIncrement` in production). Bump the patch for fixes, the minor for new features,
  and the major for changes that need a new store review of core behavior.
- **Each release.** Move the Unreleased notes under a new version heading with the date,
  bump `app.json`, tag the commit `vX.Y.Z`, then build and submit (see
  [docs/launch-checklist.md](docs/launch-checklist.md)). Store "What's new" text comes
  from these notes, in plain words.
- **Database first.** Migrations only add; apply them before shipping a client that uses
  them, so an older app keeps working until people update.
- **Updates.** The web app deploys on merge. Mobile fixes that change only JavaScript can
  go out with `eas update`; anything native (a new module, permission, or SDK) needs a
  new store build. Dependency updates arrive weekly from Dependabot, and the Deno imports
  are checked weekly by `.github/workflows/deno-deps.yml`.

## [Unreleased] — 1.0.0 (first release)

### Added

- **Syllabus to plan.** Upload a PDF or photo, paste text, or link a syllabus; the AI
  parser finds the course, grade categories, and due dates; you review every item
  (low-confidence ones first) before anything is saved.
- **Today, Calendar, Courses, Focus, and Stats** on the web and in the iOS and Android
  apps: a ranked task list with reviews first, a month/week calendar (a week agenda on
  phones), current grade and "needed on the final", a focus timer with streaks, and
  focus time against grades.
- **Study plan and reminders.** Study blocks scheduled around your study hours, spaced
  reviews before exams, and push, web push, and email reminders with quiet hours.
- **Study cards** from your notes, exported to Anki or Quizlet.
- **Calendar feed** (ICS), Google Calendar sync, and Canvas import.
- **Pro plan** through Stripe on the web and RevenueCat in the apps.
- **Tablets.** The apps rotate and use a navigation rail on tablets.
- **Store review account** script (`pnpm reviewer:seed`).

### Security and privacy

- Row-level security on every table, a cross-user access suite in CI, strict request
  validation, rate limits, and secret scanning (pre-commit and full history).
- Ask before sending anything to the AI provider (Anthropic), revocable in Settings and
  enforced in the database.
- 13+ age gate, terms acceptance, account deletion in the app and on the web, data
  export, and a public account-deletion request page.
- License and dependency-advisory checks in CI; Dependabot for npm and GitHub Actions.

### Accessibility

- Labels, roles, 48 pt targets, status in words and icons (never color alone),
  announcements for timer start, pause, and finish, and layouts that hold at 200% text.
- Reduce motion respected on the web and in the apps; every swipe has a button.
