#!/usr/bin/env bash
# Starts the local Supabase stack in CI, with up to three attempts.
#
#   bash scripts/ci-supabase-start.sh start -x studio,imgproxy,...
#   bash scripts/ci-supabase-start.sh db start
#
# Now and then Docker on GitHub's runners fails to publish Postgres's port ("failed to bind
# host port ... 54322 ... address already in use") on a fresh machine, even with the port
# range reserved. When that happens this prints what holds Supabase's ports, stops the
# half-started stack, and tries again. Any other failure fails the same way three times.
set -uo pipefail
cd "$(dirname "$0")/.."

for attempt in 1 2 3; do
  if pnpm exec supabase "$@"; then
    exit 0
  fi
  echo "::warning::supabase $* failed (attempt ${attempt} of 3). Listeners on Supabase's ports:"
  sudo ss -ltnp 2>/dev/null | grep -E ':543(2[0-9])\b' || echo "(none)"
  docker ps -a --format '{{.Names}} {{.Status}} {{.Ports}}' || true
  pnpm exec supabase stop --no-backup >/dev/null 2>&1 || true
  sleep 5
done
exit 1
