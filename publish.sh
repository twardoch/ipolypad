#!/usr/bin/env bash
# this_file: publish.sh
# Publish both ipolypad_py (PyPI) and ipolypad_js (npm).
#
# Pre-requisites:
#   - clean working tree
#   - git tag at HEAD (created by `uvx gitnextver`)
#   - PyPI token in ~/.pypirc or UV_PUBLISH_TOKEN env var
#   - npm login already done (`npm whoami` works)
#
# Run from repo root. Refuses without an exact tag at HEAD.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

YELLOW="\033[33m"; GREEN="\033[32m"; RED="\033[31m"; RESET="\033[0m"
log()  { printf "${YELLOW}▶ %s${RESET}\n" "$*"; }
ok()   { printf "${GREEN}✓ %s${RESET}\n" "$*"; }
die()  { printf "${RED}✗ %s${RESET}\n" "$*" >&2; exit 1; }

# ── Safety ────────────────────────────────────────────────────────────────
if [[ -n "$(git status --porcelain)" ]]; then
  die "working tree is dirty; commit or stash first"
fi
if ! TAG="$(git describe --exact-match --tags HEAD 2>/dev/null)"; then
  die "HEAD has no exact tag; run \`uvx gitnextver\` first"
fi
log "publishing tag $TAG"

# ── Build first ───────────────────────────────────────────────────────────
"$ROOT/build.sh"

# ── Python ────────────────────────────────────────────────────────────────
log "publish python (PyPI)"
cd "$ROOT/ipolypad_py"
# `uv publish` reads UV_PUBLISH_TOKEN or PyPI creds in ~/.pypirc
uv publish dist/*
ok "python published"

# ── JavaScript ────────────────────────────────────────────────────────────
log "publish javascript (npm)"
cd "$ROOT/ipolypad_js"
# Sync package.json version to the git tag (strip leading v)
VERSION="${TAG#v}"
node --experimental-strip-types -e "const fs=require('fs'); const p=JSON.parse(fs.readFileSync('package.json','utf8')); p.version='$VERSION'; fs.writeFileSync('package.json', JSON.stringify(p,null,2)+'\n');" 2>/dev/null || \
  npm version "$VERSION" --no-git-tag-version >/dev/null
npm publish --access public
ok "javascript published as ipolypad-js@$VERSION"

ok "all done — verify on https://pypi.org/project/ipolypad/ and https://www.npmjs.com/package/ipolypad-js"
