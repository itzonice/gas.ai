# StudyPulse

Turborepo + pnpm monorepo.

| Path            | What                                          |
| --------------- | --------------------------------------------- |
| `apps/web`      | Next.js (App Router, TypeScript)              |
| `apps/mobile`   | Expo (React Native, TypeScript)               |
| `packages/core` | Shared business logic, used by web and mobile |
| `packages/db`   | Database types                                |

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
