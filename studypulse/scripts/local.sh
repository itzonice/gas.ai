#!/usr/bin/env bash
# Runs StudyPulse on this machine:
#
#   pnpm app     the phone app first: the backend, then Expo (scan the QR code with Expo Go,
#                or press i / a for a simulator)
#   pnpm web     the backend, then the website on http://localhost:3000
#   pnpm local   the same as `pnpm web`
#
# Both start the same backend, reset to the seeded demo data:
#   - Supabase (Postgres, Auth, Storage, Studio) in Docker
#   - the edge functions (supabase functions serve)
# Needs Docker running, Node 22+, and pnpm 10. Ctrl+C stops the functions and the app or
# website; `pnpm db:stop` stops Supabase.
set -euo pipefail
cd "$(dirname "$0")/.."

TARGET="${1:-web}"
case "$TARGET" in
  app | web) ;;
  *)
    echo "Usage: bash scripts/local.sh app|web" >&2
    exit 2
    ;;
esac

supabase() { pnpm exec supabase "$@"; }

if ! docker info >/dev/null 2>&1; then
  echo "Docker isn't running. Start Docker Desktop (or dockerd) and try again." >&2
  exit 1
fi

# Run `pnpm app` in one terminal and `pnpm web` in another: whichever starts second finds the
# backend already up, keeps its data, and doesn't start the functions twice. Set
# STUDYPULSE_RESET=1 to start again from the demo data.
if supabase status >/dev/null 2>&1 && [ "${STUDYPULSE_RESET:-0}" != "1" ]; then
  echo "==> Supabase is already running; keeping its data (STUDYPULSE_RESET=1 starts over)"
  BACKEND_UP=1
else
  BACKEND_UP=0
  echo "==> Starting Supabase (first run downloads images, a few minutes)"
  supabase start >/dev/null 2>&1 || supabase start
  echo "==> Resetting the database to the seeded demo data"
  supabase db reset >/dev/null 2>&1 || supabase db reset
fi

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

if pgrep -f "supabase.* functions serve" >/dev/null 2>&1; then
  echo "==> The edge functions are already being served"
else
  echo "==> Serving edge functions"
  supabase functions serve --env-file supabase/functions/.env >/tmp/studypulse-functions.log 2>&1 &
  pids+=($!)
fi

# A phone can't reach "localhost" on this computer, so the app gets this computer's address
# on the local network (override it with STUDYPULSE_HOST, e.g. 10.0.2.2 for an Android
# emulator). The phone and this computer need to be on the same Wi-Fi.
lan_host() {
  node -e "
    const nets = Object.values(require('os').networkInterfaces()).flat();
    const lan = nets.find((n) => n && n.family === 'IPv4' && !n.internal);
    process.stdout.write(lan ? lan.address : '127.0.0.1');
  "
}

if [ "$TARGET" = app ]; then
  HOST="${STUDYPULSE_HOST:-$(lan_host)}"
  PHONE_API_URL="${API_URL/127.0.0.1/$HOST}"
  PHONE_API_URL="${PHONE_API_URL/localhost/$HOST}"
  # The two Supabase lines are rewritten on every run (the address changes with the
  # network); anything else you add to this file is kept.
  touch apps/mobile/.env.local
  grep -v -E '^(EXPO_PUBLIC_SUPABASE_URL|EXPO_PUBLIC_SUPABASE_ANON_KEY|EXPO_PUBLIC_APP_ENV)=' \
    apps/mobile/.env.local > apps/mobile/.env.local.tmp || true
  {
    echo "EXPO_PUBLIC_APP_ENV=development"
    echo "EXPO_PUBLIC_SUPABASE_URL=$PHONE_API_URL"
    echo "EXPO_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY"
    cat apps/mobile/.env.local.tmp
  } > apps/mobile/.env.local
  rm -f apps/mobile/.env.local.tmp
  cat <<INFO

  StudyPulse is running (phone app)
  ------------------------------------------------------------
  The app talks to   $PHONE_API_URL
  Demo login         demo@studypulse.dev / studypulse-demo
  Studio (data)      http://localhost:54323
  Emails (test)      http://localhost:54324
  Function logs      /tmp/studypulse-functions.log
  Website too?       open another terminal and run: pnpm web
  ------------------------------------------------------------
  Expo is starting: scan the QR code with Expo Go (same Wi-Fi), or press i or a.

INFO
  pnpm --filter @studypulse/mobile start
else
  cat <<INFO

  StudyPulse is running locally (website)
  ------------------------------------------------------------
  Web app          http://localhost:3000
  API (Supabase)   $API_URL
  Studio (data)    http://localhost:54323
  Emails (test)    http://localhost:54324
  Database         $DB_URL
  Demo login       demo@studypulse.dev / studypulse-demo
  Function logs    /tmp/studypulse-functions.log
  Phone app too?   open another terminal and run: pnpm app
  ------------------------------------------------------------

INFO
  pnpm --filter @studypulse/web dev
fi
