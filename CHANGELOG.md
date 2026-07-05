<!-- this_file: CHANGELOG.md -->
# Changelog

All notable changes to ipolypad (both `ipolypad` Python and `ipolypad-js`).
A single git tag releases both packages.

## [Unreleased]

### Added

- **CI** (`.github/workflows/ci.yml`): one job builds and tests the Python
  package, the JavaScript package, and the cross-language parity suite against
  the same commit (Python 3.10 + 3.12 matrix, Node 20), including the
  best-effort end-to-end parity check (`RUN_E2E=1`).
- **Release** (`.github/workflows/release.yml`): a `v*` tag publishes `ipolypad`
  to PyPI (trusted publishing / OIDC) and `ipolypad-js` to npm.
- **Docs**: a dedicated [Parity surface](docs/parity.md) page stating exactly
  what is guaranteed byte-identical between the two implementations and what is
  one-sided by design, plus a "Which implementation?" decision guide.
- Docs site logo (`docs/assets/icon.png`): low-poly chameleon hull with vertex
  dots, dashed padding outline, and text-wrap lines.

### Changed

- `CLAUDE.md`: replaced the stale "greenfield" status with real build/test
  commands and the CI/release layout.
- Annotated the non-obvious numerics for future maintainers: why the potrace
  parameters are fixed at `turdsize=2, turnpolicy=0, alphamax=1.0`
  (`trace.py`), and how the RDP epsilon binary search in `decimate` converges
  on a target vertex count (`simplify.py` / `simplify.ts`, kept parallel across
  both languages).

## [1.0.9] and earlier

Initial implementation of the two-package pipeline: rasterize → pad → potrace →
outer-shell pick → convex hull → RDP simplify → normalize → JSON/CSS, with the
cross-language parity contract, docs, and demo. See git history for details.
