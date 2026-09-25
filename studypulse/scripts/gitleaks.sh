#!/usr/bin/env bash
# Secret scan of the git history and of staged changes (launch safety S31).
#
#   bash scripts/gitleaks.sh history   # every commit on every branch (CI, pnpm secrets:history)
#   bash scripts/gitleaks.sh staged    # what's about to be committed (the pre-commit hook)
#
# Uses a pinned gitleaks release, downloaded once into studypulse/.tools/ and checked
# against its published SHA-256 before it runs. A gitleaks already on PATH at the same
# version is used instead. Rules and allowlists live in /.gitleaks.toml.
set -euo pipefail

VERSION="8.28.0"
MODE="${1:-}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
repo_root="$(git -C "$here" rev-parse --show-toplevel)"
config="$repo_root/.gitleaks.toml"

case "$MODE" in
  history | staged) ;;
  *)
    echo "usage: gitleaks.sh history|staged" >&2
    exit 2
    ;;
esac

# SHA-256 of each release archive, from gitleaks_${VERSION}_checksums.txt.
checksum_for() {
  case "$1" in
    linux_x64) echo a65b5253807a68ac0cafa4414031fd740aeb55f54fb7e55f386acb52e6a840eb ;;
    linux_arm64) echo eff65261156100e5d94a6b3dec313d532fddfe19ae1590bf7a2b4f2699128356 ;;
    darwin_x64) echo edf5a507008b0d2ef4959575772772770586409c1f6f74dabf19cbe7ec341ced ;;
    darwin_arm64) echo d942f3ad147250c9edbaab3fed9e482f98d3b59ba10ae97b8d75647e3ade492c ;;
    *) return 1 ;;
  esac
}

platform() {
  local os arch
  case "$(uname -s)" in
    Linux) os=linux ;;
    Darwin) os=darwin ;;
    *) return 1 ;;
  esac
  case "$(uname -m)" in
    x86_64 | amd64) arch=x64 ;;
    arm64 | aarch64) arch=arm64 ;;
    *) return 1 ;;
  esac
  echo "${os}_${arch}"
}

sha256() {
  if command -v sha256sum >/dev/null; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi
}

resolve_gitleaks() {
  if command -v gitleaks >/dev/null && gitleaks version 2>/dev/null | grep -qx "v\?$VERSION"; then
    command -v gitleaks
    return
  fi
  local bin="$here/.tools/gitleaks-$VERSION/gitleaks"
  if [ -x "$bin" ]; then
    echo "$bin"
    return
  fi
  local plat expected archive tmp
  plat="$(platform)" || {
    echo "gitleaks.sh: unsupported platform $(uname -s)/$(uname -m); install gitleaks $VERSION on PATH" >&2
    exit 1
  }
  expected="$(checksum_for "$plat")"
  archive="gitleaks_${VERSION}_${plat}.tar.gz"
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' RETURN
  echo "gitleaks.sh: downloading gitleaks $VERSION ($plat)" >&2
  curl -sSfL -o "$tmp/$archive" "https://github.com/gitleaks/gitleaks/releases/download/v$VERSION/$archive"
  local actual
  actual="$(sha256 "$tmp/$archive")"
  if [ "$actual" != "$expected" ]; then
    echo "gitleaks.sh: checksum mismatch for $archive (expected $expected, got $actual)" >&2
    exit 1
  fi
  tar -xzf "$tmp/$archive" -C "$tmp" gitleaks
  mkdir -p "$(dirname "$bin")"
  mv "$tmp/gitleaks" "$bin"
  chmod +x "$bin"
  echo "$bin"
}

gitleaks_bin="$(resolve_gitleaks)"
cd "$repo_root"

if [ "$MODE" = history ]; then
  exec "$gitleaks_bin" git --config "$config" --redact --no-banner --log-opts="--all" .
else
  exec "$gitleaks_bin" git --config "$config" --redact --no-banner --staged .
fi
