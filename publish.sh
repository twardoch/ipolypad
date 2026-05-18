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

dirty_status() {
  git status --porcelain --untracked-files=all -- . ':!.omc'
}

require_clean_tree() {
  local status
  status="$(dirty_status)"
  if [[ -n "$status" ]]; then
    printf "%s\n" "$status" >&2
    die "working tree has uncommitted product changes; commit or stash before publishing"
  fi
}

# ── Safety ────────────────────────────────────────────────────────────────
require_clean_tree
if ! TAG="$(git describe --exact-match --tags HEAD 2>/dev/null)"; then
  die "HEAD has no exact tag; run \`uvx gitnextver\` first"
fi
log "publishing tag $TAG"
VERSION="${TAG#v}"

# ── Credential preflight ──────────────────────────────────────────────────
log "check npm authentication"
npm whoami >/dev/null || die "npm is not authenticated; run \`npm login\` before publishing"
ok "npm authenticated"

# ── Build first ───────────────────────────────────────────────────────────
"$ROOT/build.sh"
require_clean_tree

# ── Python ────────────────────────────────────────────────────────────────
log "publish python (PyPI)"
cd "$ROOT/ipolypad_py"
# `uv publish` reads UV_PUBLISH_TOKEN or PyPI creds in ~/.pypirc
uv publish \
  --check-url "https://pypi.org/simple/ipolypad/" \
  "dist/ipolypad-${VERSION}.tar.gz" \
  "dist/ipolypad-${VERSION}-py3-none-any.whl"
ok "python published"

# ── JavaScript ────────────────────────────────────────────────────────────
log "publish javascript (npm)"
cd "$ROOT/ipolypad_js"
TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT
rsync -a \
  --exclude node_modules \
  --exclude .npm \
  --exclude .turbo \
  --exclude .cache \
  "$ROOT/ipolypad_js/" "$TMPDIR/ipolypad_js/"
cp "$ROOT/LICENSE" "$TMPDIR/ipolypad_js/LICENSE"
cd "$TMPDIR/ipolypad_js"
node - "$VERSION" <<'NODE'
const fs = require('fs');
const version = process.argv[2];
for (const file of ['package.json', 'package-lock.json']) {
  const path = file;
  if (!fs.existsSync(path)) continue;
  const data = JSON.parse(fs.readFileSync(path, 'utf8'));
  data.version = version;
  if (data.packages?.['']) data.packages[''].version = version;
  if (file === 'package.json' && data.scripts) {
    delete data.scripts.prepublishOnly;
  }
  fs.writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}
NODE
npm publish --access public --ignore-scripts
ok "javascript published as ipolypad-js@$VERSION"

ok "all done — verify on https://pypi.org/project/ipolypad/ and https://www.npmjs.com/package/ipolypad-js"
