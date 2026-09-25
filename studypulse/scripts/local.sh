#!/usr/bin/env bash
# Runs all of StudyPulse on this machine:  pnpm local
#   - Supabase (Postgres, Auth, Storage, Studio) in Docker, reset to the seeded demo data
#   - the edge functions (supabase functions serve)
#   - the web app on http://localhost:3000
# Needs Docker running, Node 22+, and pnpm 10. Ctrl+C stops the functions and web app;
# `pnpm db:stop` stops Supabase.
set -euo pipefail
cd "$(dirname "$0")/.."

supabase() { pnpm exec supabase "$@"; }

if ! docker info >/dev/null 2>&1; then
  echo "Docker isn't running. Start Docker Desktop (or dockerd) and try again." >&2
  exit 1
fi

echo "==> Starting Supabase (first run downloads images, a few minutes)"
supabase start >/dev/null 2>&1 || supabase start
echo "==> Resetting the database to the seeded demo data"
supabase db reset >/dev/null 2>&1 || supabase db reset

status=$(supabase status -o json)
field() { node -e "process.stdout.write(JSON.parse(process.argv[1])[process.argv[2]] ?? '')" "$status" "$1"; }
API_URL=$(field API_URL)
ANON_KEY=$(field ANON_KEY)
SERVICE_KEY=$(field SERVICE_ROLE_KEY)
DB_URL=$(field DB_URL)

# Env files are created once and then left alone, so your own additions (API keys,
# Stripe test keys, ...) survive later runs.
if [ ! -f apps/web/.env.local ]; then
  cat > apps/web/.env.local <<ENV
NEXT_PUBLIC_APP_ENV=development
NEXT_PUBLIC_SUPABASE_URL=$API_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=$SERVICE_KEY
ENV
  echo "==> Wrote apps/web/.env.local"
fi
if [ ! -f supabase/functions/.env ]; then
  cat > supabase/functions/.env <<ENV
APP_ENV=development
APP_URL=http://localhost:3000
CRON_SECRET=$(node -e "process.stdout.write(require('crypto').randomBytes(24).toString('base64url'))")
# Add ANTHROPIC_API_KEY=... to parse real syllabi.
ENV
  echo "==> Wrote supabase/functions/.env"
fi
if ! grep -q '^CRON_SECRET=.' supabase/functions/.env; then
  echo "CRON_SECRET=$(node -e "process.stdout.write(require('crypto').randomBytes(24).toString('base64url'))")" >> supabase/functions/.env
fi
CRON_SECRET=$(grep '^CRON_SECRET=' supabase/functions/.env | tail -1 | cut -d= -f2-)

# Let pg_cron call the functions (reminders, nightly replans) through the local gateway.
docker exec -i supabase_db_studypulse psql -q -U postgres -d postgres >/dev/null <<SQL
delete from vault.secrets where name in ('project_url', 'cron_secret');
select vault.create_secret('http://supabase_kong_studypulse:8000', 'project_url');
select vault.create_secret('$CRON_SECRET', 'cron_secret');
SQL

pids=()
cleanup() { for p in "${pids[@]}"; do kill "$p" 2>/dev/null || true; done; }
trap cleanup EXIT INT TERM

echo "==> Serving edge functions"
supabase functions serve --env-file supabase/functions/.env >/tmp/studypulse-functions.log 2>&1 &
pids+=($!)

cat <<INFO

  StudyPulse is running locally
  ------------------------------------------------------------
  Web app          http://localhost:3000
  API (Supabase)   $API_URL
  Studio (data)    http://localhost:54323
  Emails (test)    http://localhost:54324
  Database         $DB_URL
  Demo login       demo@studypulse.dev / studypulse-demo
  Function logs    /tmp/studypulse-functions.log
  ------------------------------------------------------------

INFO

pnpm --filter @studypulse/web dev
