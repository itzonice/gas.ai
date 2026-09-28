#!/usr/bin/env bash
# Runs the cross-user access suite (supabase/tests/e2e) against the local stack.
# Needs `supabase start` (with the edge runtime) or, where that can't run,
# `node scripts/serve-functions.mjs` plus FUNCTIONS_URL=http://127.0.0.1:54390/functions/v1.
# Keys come from `supabase status` and never leave this machine.
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  eval "$(pnpm exec supabase status -o env \
    --override-name api.url=SUPABASE_URL \
    --override-name auth.anon_key=SUPABASE_ANON_KEY \
    --override-name auth.service_role_key=SUPABASE_SERVICE_ROLE_KEY 2>/dev/null |
    grep -E '^SUPABASE_(URL|ANON_KEY|SERVICE_ROLE_KEY)=' | sed 's/^/export /')"
fi
export CROSS_USER_REPORT="${CROSS_USER_REPORT:-$PWD/cross-user-report.md}"
cd supabase/functions
exec deno test --allow-env --allow-net --allow-read=. --allow-write="$CROSS_USER_REPORT" \
  ../tests/e2e/cross_user.test.ts
