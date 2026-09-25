#!/usr/bin/env bash
# Proves the pre-commit hook blocks secrets (launch safety S31). Builds a throwaway repo
# with this repo's hook, script, and /.gitleaks.toml, then tries four commits:
#   a clean file                                  -> allowed
#   a fake Stripe live key                        -> blocked
#   an RFC 8291 test vector in the allowlisted file -> allowed
#   the same vector in any other file             -> blocked
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
repo_root="$(git -C "$here" rev-parse --show-toplevel)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

mkdir -p "$tmp/studypulse/scripts" "$tmp/studypulse/.githooks"
cp "$repo_root/.gitleaks.toml" "$tmp/"
cp "$here/scripts/gitleaks.sh" "$tmp/studypulse/scripts/"
cp "$here/.githooks/pre-commit" "$tmp/studypulse/.githooks/"
# Reuse an already downloaded gitleaks.
[ -d "$here/.tools" ] && cp -R "$here/.tools" "$tmp/studypulse/.tools"

cd "$tmp"
git init -q
git config user.email hook-test@example.invalid
git config user.name "hook test"
git config core.hooksPath studypulse/.githooks
git add -A && git commit -qm "setup" --no-verify

failures=0
expect() {
  local want="$1" path="$2" content="$3"
  mkdir -p "$(dirname "$path")"
  printf '%s\n' "$content" >"$path"
  git add "$path"
  if git commit -qm "try $path" >/dev/null 2>&1; then got=allowed; else got=blocked; fi
  if [ "$got" = "$want" ]; then
    echo "ok: $path $got"
  else
    echo "FAIL: $path was $got, expected $want" >&2
    failures=$((failures + 1))
  fi
  git reset -q --hard HEAD
}

# Assembled here so this file itself doesn't hold a key-shaped string.
stripe="sk_""live_""4eC39HqLyjWDarjtT1zdp7dc51Hxyz"
vector="BTBZMqHH6r4Tts7J_aSIgg"

expect allowed notes.md "just some notes"
expect blocked config.ts "export const stripeKey = \"$stripe\";"
expect allowed studypulse/packages/core/src/notify/webpush.test.ts "  auth: \"$vector\","
expect blocked src/other.test.ts "  auth: \"$vector\","

if [ "$failures" -gt 0 ]; then
  echo "gitleaks hook test: $failures failure(s)" >&2
  exit 1
fi
echo "gitleaks hook test: all passed"
