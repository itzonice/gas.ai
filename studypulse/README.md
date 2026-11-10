# StudyPulse

A study app for students. Add your courses (upload a syllabus, or type them in) and
StudyPulse works out your grades, what to do first, and when to study. Then study:
flashcards you can flip, Learn, practice Tests, and Match, with reviews that come back
when you're about to forget them. Take notes in class and turn the key terms into cards.

Turborepo + pnpm monorepo.

| Path            | What                                          |
| --------------- | --------------------------------------------- |
| `apps/web`      | Next.js (App Router, TypeScript)              |
| `apps/mobile`   | Expo (React Native, TypeScript)               |
| `packages/core` | Shared business logic, used by web and mobile |
| `packages/db`   | Database types                                |

## Run it on your machine

Needs [Docker](https://www.docker.com/products/docker-desktop/) running, Node 22+, and
pnpm 10. Run `pnpm install` once.

**The phone app first**

```sh
pnpm app
```

That starts the backend (reset to the demo data), then Expo. Scan the QR code with
[Expo Go](https://expo.dev/go) on a phone on the same Wi-Fi, or press `i` (iOS simulator)
or `a` (Android emulator). Sign in with the demo login below. The app reaches the backend
at this computer's address on your network; if that guess is wrong (several network
adapters, or an Android emulator, which wants `10.0.2.2`), start it with
`STUDYPULSE_HOST=<address> pnpm app`.

**The website**, in a second terminal (it reuses the backend that is already running):

```sh
pnpm web
```

Open http://localhost:3000. `pnpm web` on its own starts the backend too.

| What           | Where                                     |
| -------------- | ----------------------------------------- |
| Web app        | http://localhost:3000                     |
| API (Supabase) | http://localhost:54321                    |
| Studio (data)  | http://localhost:54323                    |
| Test emails    | http://localhost:54324                    |
| Demo login     | `demo@studypulse.dev` / `studypulse-demo` |

The demo account has four courses, grades, a study plan, three card sets (some cards
due), and three notes, so every screen has something on it.

`Ctrl+C` stops the app or website and the functions; `pnpm db:stop` stops Supabase. The
backend keeps its data between runs; `STUDYPULSE_RESET=1 pnpm app` (or `pnpm web`) starts
again from the demo data. The first run writes `apps/web/.env.local`,
`apps/mobile/.env.local`, and `supabase/functions/.env`; add keys there and they're kept.

### What works without any keys

Everything you can try in the app: courses (by hand), the Today feed, the calendar, grades
and what-if, the focus timer, stats, flashcards, Learn, Test, Match, spaced review, notes,
turning a note's own `term :: definition` lines into cards, and import and export of cards.

Needs a key (off until you add it; `pnpm deploy:check` lists what each one needs):

| Feature                                             | Key                                              |
| --------------------------------------------------- | ------------------------------------------------ |
| Reading a syllabus; making cards from notes with AI | `ANTHROPIC_API_KEY` in `supabase/functions/.env` |
| Paying for Pro                                      | Stripe (web) or RevenueCat (phone)               |
| Reminder and digest emails                          | Resend                                           |
| Browser push notifications                          | VAPID keys                                       |
| Google Calendar sync                                | Google OAuth                                     |

Never put a key in a file that's committed or in a chat. The `.env*` files are ignored by
git, and a pre-commit hook scans for secrets.

### If the phone app won't open in Expo Go

The app uses a few native modules (Screen Time focus blocking, in-app purchases, Sentry)
that are optional: without them those features switch themselves off. If Expo Go still
refuses to load it, build a development version once with `pnpm --filter
@studypulse/mobile run ios` or `... run android` (needs Xcode or Android Studio).

## Study

Study is a main destination on the web and a tab in the phone app:

- **Card sets** belong to a course. Add cards by typing, by pasting from Quizlet or a
  spreadsheet, or from a note. On the website you can also download a set for Anki or Quizlet.
- **Flashcards**: flip, then rate Again, Hard, Good, or Easy; the card comes back sooner or
  later depending on how you did (spaced review, like Anki). Cards due show on Study and
  in "Review N due".
- **Learn**: multiple choice, then typing; misses come back before the round ends.
- **Test**: a practice test with multiple choice, true or false, and written questions, and
  no timer.
- **Match**: pair terms with definitions; the clock only counts up and can be hidden.
- **Notes**: a note editor that saves by itself, with formatting, a preview, and "Make
  flashcards". On the phone, reviews made offline sync when you're back online.

## Developing

```sh
pnpm install
pnpm lint         # ESLint in every workspace
pnpm typecheck    # tsc --noEmit in every workspace
pnpm test         # unit tests, and the Deno tests for the edge functions
pnpm format       # Prettier
pnpm db:reset     # re-apply every migration and the demo data
pnpm test:cross-user   # signed-in users trying to read or change each other's data
```

More: `docs/` (security, accessibility, launch checklist) and `handoff.md`.
