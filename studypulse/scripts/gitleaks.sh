#!/usr/bin/env bash
# Secret scanning with gitleaks (launch safety S31). Downloads a pinned, checksum-verified
# gitleaks into .tools/ on first use, then runs it with the repo's .gitleaks.toml.
#
#   bash scripts/gitleaks.sh history   # every commit in the repository (CI)
#   bash scripts/gitleaks.sh staged    # what's about to be committed (pre-commit hook)
set -euo pipefail

VERSION=8.28.0
here="$(cd "$(dirname "$0")/.." && pwd)"
# Inside a hook, git sets GIT_DIR, and rev-parse would then report the current directory
# rather than the work tree (wrong in a linked worktree); ask without it.
repo="$(cd "$here" && env -u GIT_DIR -u GIT_WORK_TREE -u GIT_INDEX_FILE git rev-parse --show-toplevel)"
tools="$here/.tools"
bin="$tools/gitleaks-$VERSION"

case "$(uname -s)-$(uname -m)" in
  Linux-x86_64) platform=linux_x64 sum=a65b5253807a68ac0cafa4414031fd740aeb55f54fb7e55f386acb52e6a840eb ;;
  Linux-aarch64 | Linux-arm64) platform=linux_arm64 sum=eff65261156100e5d94a6b3dec313d532fddfe19ae1590bf7a2b4f2699128356 ;;
  Darwin-x86_64) platform=darwin_x64 sum=edf5a507008b0d2ef4959575772772770586409c1f6f74dabf19cbe7ec341ced ;;
  Darwin-arm64) platform=darwin_arm64 sum=d942f3ad147250c9edbaab3fed9e482f98d3b59ba10ae97b8d75647e3ade492c ;;
  *) echo "gitleaks: unsupported platform $(uname -s)-$(uname -m); install gitleaks $VERSION yourself" >&2; exit 1 ;;
esac

if [ ! -x "$bin" ]; then
  mkdir -p "$tools"
  archive="$tools/gitleaks_${VERSION}_${platform}.tar.gz"
  echo "Downloading gitleaks $VERSION ($platform)…" >&2
  curl -fsSL -o "$archive" \
    "https://github.com/gitleaks/gitleaks/releases/download/v${VERSION}/gitleaks_${VERSION}_${platform}.tar.gz"
  if command -v sha256sum >/dev/null; then actual="$(sha256sum "$archive" | cut -d' ' -f1)"
  else actual="$(shasum -a 256 "$archive" | cut -d' ' -f1)"; fi
  if [ "$actual" != "$sum" ]; then
    rm -f "$archive"
    echo "gitleaks: checksum mismatch for $platform; refusing to run it" >&2
    exit 1
  fi
  tar -xzf "$archive" -C "$tools" gitleaks
  mv "$tools/gitleaks" "$bin"
  rm -f "$archive"
fi

cd "$repo"
case "${1:-}" in
  history) exec "$bin" git --no-banner --redact --config "$repo/.gitleaks.toml" "$repo" ;;
  staged) exec "$bin" git --no-banner --redact --pre-commit --staged --config "$repo/.gitleaks.toml" "$repo" ;;
  *) echo "usage: $0 history|staged" >&2; exit 2 ;;
esac
