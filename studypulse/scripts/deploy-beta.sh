#!/usr/bin/env bash
# Deploys a private beta: the database, edge functions, and auth settings to a Supabase
# project, and the web app to Vercel, then prints the link to open on any phone or laptop.
#
#   bash scripts/deploy-beta.sh
#
# Reads these from the environment (set them in the environment settings, never in chat
# or in a file in the repo):
#   SUPABASE_ACCESS_TOKEN   Supabase account token (Account, Access tokens)
#   SUPABASE_PROJECT_REF    the beta project's reference id (Project settings, General)
#   SUPABASE_DB_PASSWORD    that project's database password
#   VERCEL_TOKEN            Vercel token (Account settings, Tokens)
#   ANTHROPIC_API_KEY       optional: without it, syllabus reading and study cards are off
#   VERCEL_SCOPE            optional: the Vercel team slug, if the project belongs to a team
#
# Safe to run again: migrations only apply what's new, functions and the site redeploy.
# No value is printed; secrets go to Supabase through a private temporary file.
set -euo pipefail

cd "$(dirname "$0")/.."
missing=()
for v in SUPABASE_ACCESS_TOKEN SUPABASE_PROJECT_REF SUPABASE_DB_PASSWORD VERCEL_TOKEN; do
  [ -n "${!v:-}" ] || missing+=("$v")
done
if [ ${#missing[@]} -gt 0 ]; then
  echo "deploy-beta: missing ${missing[*]}. Add them in the environment settings." >&2
  exit 2
fi

REF="$SUPABASE_PROJECT_REF"
API="https://api.supabase.com/v1/projects/$REF"
SUPABASE_URL="https://$REF.supabase.co"
PROJECT="${VERCEL_PROJECT:-studypulse-beta}"
scope=()
[ -n "${VERCEL_SCOPE:-}" ] && scope=(--scope "$VERCEL_SCOPE")
vercel() { pnpm dlx vercel@latest "$@" --token "$VERCEL_TOKEN" "${scope[@]}"; }
step() { printf '\n== %s\n' "$*"; }

step "1/7 Link the Supabase project"
pnpm exec supabase link --project-ref "$REF" --password "$SUPABASE_DB_PASSWORD" >/dev/null

step "2/7 Apply database migrations (no demo data)"
pnpm exec supabase db push --password "$SUPABASE_DB_PASSWORD" --include-all

step "3/7 Push auth and API settings from supabase/config.toml"
# Minimum password length, email confirmation, exposed schemas, and the age and
# password hooks (S12, S33, S34), so the dashboard matches the code.
pnpm exec supabase config push --project-ref "$REF" <<<"y" >/dev/null

step "4/7 Anon key (public by design)"
ANON_KEY="$(pnpm exec supabase projects api-keys --project-ref "$REF" -o json |
  node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const k=JSON.parse(s).find(x=>x.name==="anon");if(!k)process.exit(1);process.stdout.write(k.api_key)})')"

step "5/7 Build and deploy the web app to Vercel"
web_env=(
  NEXT_PUBLIC_APP_ENV=preview
  NEXT_PUBLIC_SUPABASE_URL="$SUPABASE_URL"
  NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY"
)
(
  cd apps/web
  vercel link --yes --project "$PROJECT" >/dev/null
  vercel pull --yes --environment=preview >/dev/null
  env "${web_env[@]}" pnpm dlx vercel@latest build --token "$VERCEL_TOKEN" "${scope[@]}" >/dev/null
  vercel deploy --prebuilt --yes >../../.vercel-beta-url
)
WEB_URL="$(tail -n 1 .vercel-beta-url)"
rm -f .vercel-beta-url

step "6/7 Function secrets and edge functions"
secrets_file="$(mktemp)"
chmod 600 "$secrets_file"
trap 'rm -f "$secrets_file"' EXIT
{
  echo "APP_ENV=preview"
  echo "APP_URL=$WEB_URL"
  # Signs unsubscribe links. Set once per project: a new value would break links in
  # emails already sent.
  if ! pnpm exec supabase secrets list --project-ref "$REF" | grep -qw EMAIL_UNSUBSCRIBE_SECRET; then
    echo "EMAIL_UNSUBSCRIBE_SECRET=$(openssl rand -base64 36 | tr -d '\n')"
  fi
  if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
    echo "ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY"
  fi
} >"$secrets_file"
pnpm exec supabase secrets set --project-ref "$REF" --env-file "$secrets_file" >/dev/null
pnpm exec supabase functions deploy --project-ref "$REF" --use-api >/dev/null

step "7/7 Point sign-up and password-reset emails at the beta site"
curl -fsS -X PATCH "$API/config/auth" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d "{\"site_url\":\"$WEB_URL\",\"uri_allow_list\":\"$WEB_URL/**\"}" >/dev/null

printf '\nBeta is live: %s\n' "$WEB_URL"
[ -n "${ANTHROPIC_API_KEY:-}" ] || echo "Syllabus reading is off (no ANTHROPIC_API_KEY); add courses by hand."
echo "Reminders and scheduled jobs stay off in the beta (no CRON_SECRET); see docs/launch-checklist.md."
