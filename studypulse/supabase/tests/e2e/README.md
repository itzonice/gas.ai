# Cross-user access suite

`cross_user.test.ts` signs in as real users over HTTP and tries to reach another user's data
through every path the API exposes. CI runs it on every push (the `cross-user` job) and
uploads `cross-user-report.md`, which lists every attempt and its result.

## Setup

- **User B** gets one of everything: a course, a grade category, assignments with scores,
  a study session with notes, an assignment resource, an Expo push token, an ICS feed
  token, a syllabus upload plus its file in storage, a study block, a flashcard, a card
  generation, a class meeting, a notification log entry, and a membership that shares
  focus hours with C's organization.
- **B's markers:** every text field B owns carries a unique marker, and B's display name
  has its own marker.
- **User A** has a course, an assignment, a card, and a session of their own.
- **User C** is the organization admin.

## What counts as a failure

The suite enumerates tables, views, and RPCs from the live OpenAPI schema, and edge
functions from `supabase/functions`, so new ones are covered automatically. An attempt
fails if any of these is true:

- The response contains B's marker, name, email, push token, or feed token.
- The response contains any of B's row ids that the request didn't send.
- An RPC's successful answer changes when B's ids are swapped for random ids. This check
  is skipped for RPCs whose answers are random anyway.
- A link attempt is accepted: A's session, card, block, or resource pointed at B's
  assignment, or A's rows moved into B's course.
- An org admin sees anything beyond a member's id, name, role, sharing flag, join date,
  and aggregate focus hours.
- B's rows, read with the service role before and after the attacks, differ in any way.

## Running it locally

```sh
pnpm exec supabase start
pnpm test:cross-user
```

If the edge runtime can't start (for example, in a sandbox without registry access),
serve the functions with the Deno CLI instead:

```sh
node scripts/serve-functions.mjs &
FUNCTIONS_URL=http://127.0.0.1:54390/functions/v1 pnpm test:cross-user
```

## Device handoff exception

A push token identifies a device. When someone signs in on a device that B used, the token
moves to them as a new row, and B's row is deleted so B's notifications stop appearing
there. The suite checks this path on its own: nothing of B's row is returned or carried
over.
