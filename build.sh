#!/usr/bin/env bash
# this_file: build.sh
# Build both ipolypad_py and ipolypad_js. Run from repo root.
#
# Refuses tracked/untracked product changes before packaging so hatch-vcs never
# emits dirty local versions by accident. OMC session state is ignored.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

YELLOW="\033[33m"; GREEN="\033[32m"; RED="\033[31m"; RESET="\033[0m"
log() { printf "${YELLOW}▶ %s${RESET}\n" "$*"; }
ok()  { printf "${GREEN}✓ %s${RESET}\n" "$*"; }
die() { printf "${RED}✗ %s${RESET}\n" "$*" >&2; exit 1; }

dirty_status() {
  git status --porcelain --untracked-files=all -- . ':!.omc'
}

require_clean_tree() {
  local status
  status="$(dirty_status)"
  if [[ -n "$status" ]]; then
    printf "%s\n" "$status" >&2
    die "working tree has uncommitted product changes; commit or stash before building"
  fi
}

require_clean_tree

# ── Python ────────────────────────────────────────────────────────────────
log "build python (ipolypad_py)"
cd "$ROOT/ipolypad_py"
if [[ ! -d .venv ]]; then
  uv venv --python 3.12 --clear
fi
uv pip install -e ".[test]" >/dev/null
uvx hatch clean
uv build --clear --no-sources --out-dir dist
ok "python wheel + sdist in ipolypad_py/dist/"

# ── JavaScript ────────────────────────────────────────────────────────────
log "build javascript (ipolypad_js)"
cd "$ROOT/ipolypad_js"
if [[ ! -d node_modules ]]; then
  npm install --silent
fi
npx tsc --noEmit
npx tsup
npx esbuild src/index.ts --bundle --format=esm --target=es2022 --external:esm-potrace-wasm --outfile="$ROOT/docs/demo/ipolypad.bundle.js" >/dev/null
ok "js bundle in ipolypad_js/dist/"

cd "$ROOT"
require_clean_tree

# ── Tests ─────────────────────────────────────────────────────────────────
log "run python tests"
cd "$ROOT/ipolypad_py"
# shellcheck disable=SC1091
source .venv/bin/activate
pytest -q
deactivate

log "run js tests"
cd "$ROOT/ipolypad_js"
npx vitest run --reporter=dot

log "run parity tests"
cd "$ROOT"
# shellcheck disable=SC1091
source ipolypad_py/.venv/bin/activate
pytest tests/parity/ -q
deactivate

ok "all green"
