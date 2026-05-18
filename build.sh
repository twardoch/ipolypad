#!/usr/bin/env bash
# this_file: build.sh
# Build both ipolypad_py and ipolypad_js. Run from repo root.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

YELLOW="\033[33m"; GREEN="\033[32m"; RESET="\033[0m"
log() { printf "${YELLOW}▶ %s${RESET}\n" "$*"; }
ok()  { printf "${GREEN}✓ %s${RESET}\n" "$*"; }

# ── Python ────────────────────────────────────────────────────────────────
log "build python (ipolypad_py)"
cd "$ROOT/ipolypad_py"
if [[ ! -d .venv ]]; then
  uv venv --python 3.12 --clear
fi
uv pip install -e ".[test]" >/dev/null
uv build --out-dir dist
ok "python wheel + sdist in ipolypad_py/dist/"

# ── JavaScript ────────────────────────────────────────────────────────────
log "build javascript (ipolypad_js)"
cd "$ROOT/ipolypad_js"
if [[ ! -d node_modules ]]; then
  npm install --silent
fi
npx tsc --noEmit
npx tsup
ok "js bundle in ipolypad_js/dist/"

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
