# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Read first

**`SPEC.md` is the authoritative description of what to build.** It defines the
pipeline, defaults, output formats, error model, cross-language parity contract,
and what's deliberately excluded from each language. Read it before writing or
changing code; update it before changing behaviour.

`private/svg2polygon.py` is the working prototype. Treat it as the canonical
reference for the pipeline's numerics — especially: circular dilation structuring
element, potrace params (`turdsize=2, turnpolicy=0, alphamax=1.0`), the
canvas-frame filter (drop curves whose area ≥ 95% of canvas), the
RDP-with-binary-search-on-ε simplifier, and the trailing-duplicate-vertex bug
fix in `_decimate`.

## Repository status

Both packages are scaffolded and released (PyPI `ipolypad`, npm `ipolypad-js`).
Layout: `ipolypad_py/` (hatch + hatch-vcs, `src/ipolypad/`) and `ipolypad_js/`
(TypeScript ESM, `src/`), with shared `tests/parity/` fixtures. `private/` holds
the original prototype and is gitignored.

Build and test both languages together:

```bash
./build.sh            # build + test py, js, and parity (refuses a dirty tree)

# Python only
cd ipolypad_py && uv run --extra test pytest -q ../tests/parity tests
# JavaScript only
cd ipolypad_js && npm install && npx vitest run
```

CI (`.github/workflows/ci.yml`) runs the Python, JS, and parity suites in one
job on every push/PR. `.github/workflows/release.yml` publishes both packages
to PyPI and npm when a `v*` tag is pushed.

## Asymmetric design

The two implementations are deliberately **not** equivalent:

- **`ipolypad_py`** is the smart one. It can do colour-distance background
  detection for non-alpha inputs, auto-contrast, adaptive thresholding, batch
  processing, and emits `json` / `css` / `svg` / `png` / `html`. CLI via
  `uvx ipolypad`. SPEC §4 lists what's allowed; don't exceed it without
  updating SPEC first.

- **`ipolypad_js`** is intentionally a strict subset. Web-first, small bundle,
  assumes alpha-bearing input, fixed `alpha > 24` threshold, no enhancement,
  emits only `json` / `css`. SPEC §5 defines exactly what's in and out.

Resist the urge to port Python smarts to JS — that breaks the size budget and
the parity contract. If a feature is needed in both, it belongs in the
**parity surface** (SPEC §10) and must round-trip byte-identically between
the two implementations.

## Cross-language parity

Identical inputs on the parity surface MUST produce byte-identical `json` and
`css` outputs across both languages. Enforce via `tests/parity/` fixtures
(SPEC §10). Rounding: 6 decimals for JSON points, 2 decimals for CSS percentages.

When you touch numerics — thresholds, structuring elements, RDP, hull,
normalization — change both languages in the same PR and run the parity
suite. Diverging silently is the failure mode this repo exists to prevent.

## Conventions

- Python: `uv` for everything; `hatch-vcs` versioning from git tags;
  `__version__.py` is generated and gitignored; Fire CLI at `__main__.py`;
  uv shebang + PEP 723 inline metadata for any standalone scripts.
- JavaScript: npm-publishable ESM, TypeScript source, no Node-only imports
  in the published bundle.
- Single git tag releases both packages. `uvx gitnextver` cuts the tag.
- `./build.sh` and `./publish.sh` orchestrate both languages.

## Working notes

- Input can be local path, `http(s)://` URL, `data:` URL, or in-memory bytes
  (Python additionally accepts more raster formats than JS — see SPEC §1.2).
- SVG root transform handling is load-bearing for Qt-exported SVGs that include
  `transform: scale(-1,1)`: neutralize root sizing/transform attrs for internal
  rasterization, then reapply detected mirror transforms to the output hull.
  Both implementations must do it.
- Padding is expressed externally as % of `size` (CLI/API ergonomics) and
  internally in pixels (numerics). Convert at the boundary.
- Convex hull is on by default for good reason (SPEC §2.7); don't disable
  silently.
- Update this file and SPEC.md as packages get scaffolded — replace this
  "greenfield" section with real build/test commands once they exist.
