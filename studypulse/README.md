# StudyPulse

Turborepo + pnpm monorepo.

| Path            | What                                          |
| --------------- | --------------------------------------------- |
| `apps/web`      | Next.js (App Router, TypeScript)              |
| `apps/mobile`   | Expo (React Native, TypeScript)               |
| `packages/core` | Shared business logic, used by web and mobile |
| `packages/db`   | Database types                                |

## Run it on your machine (localhost)

Needs [Docker](https://www.docker.com/products/docker-desktop/) running, Node 22+, and pnpm 10.

```sh
pnpm install
pnpm local
```

That starts everything and resets the database to the demo data:

| What           | URL                                       |
| -------------- | ----------------------------------------- |
| Web app        | http://localhost:3000                     |
| API (Supabase) | http://localhost:54321                    |
| Studio (data)  | http://localhost:54323                    |
| Test emails    | http://localhost:54324                    |
| Demo login     | `demo@studypulse.dev` / `studypulse-demo` |

`Ctrl+C` stops the web app and functions; `pnpm db:stop` stops Supabase. The first run
writes `apps/web/.env.local` and `supabase/functions/.env`; add keys there (for example
`ANTHROPIC_API_KEY` to parse real syllabi, or Stripe test keys) and they're kept.

## Getting started

```sh
pnpm install
pnpm dev          # run all apps
pnpm lint         # ESLint in every workspace
pnpm typecheck    # tsc --noEmit in every workspace
pnpm test
pnpm format       # Prettier
```

Requires Node 22+ and pnpm 10.
