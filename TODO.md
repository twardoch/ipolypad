<!-- this_file: TODO.md -->
# TODO

Flat list of future work. See `SPEC.md` for the authoritative behaviour contract
and `CHANGELOG.md` for what has shipped.

## Parity & correctness

- [ ] Make end-to-end parity (`RUN_E2E=1`) contractual, not best-effort: pin
      `potracer` and `esm-potrace-wasm` to versions verified to trace
      identically, and add a CI guard that fails if either drifts.
- [ ] Add explicit parity fixtures for the SVG root mirror-transform path
      (Qt-exported `transform: scale(-1,1)`) through the full pipeline, not just
      the `detect`/`apply` unit level.
- [ ] Document the padding-beyond-100% behaviour in the CLI `--help` and the JS
      API JSDoc (currently only in SPEC/README/docs), since negative and >100%
      percentages surprise first-time users.

## Release plumbing

- [ ] Sync the npm `package.json` version to the git tag automatically (today
      `hatch-vcs` derives the Python version from the tag but the JS version is
      hand-edited). Either read the tag in `release.yml` or have `publish.sh`
      write it, so a single `vX.Y.Z` tag can't ship mismatched versions.
- [ ] Add `mypy` to CI once third-party stubs (numpy, scipy, skimage, resvg_py,
      fire) are available or ignored via config, so type regressions are caught.

## Features (would require a SPEC update first)

- [ ] Optional concave (alpha-shape) hull mode for callers that want a tighter
      wrap than the convex hull, gated behind an explicit flag.
- [ ] WebP / AVIF raster input support in Python (Pillow already decodes them;
      needs a SPEC §1.2 entry and parity consideration).
- [ ] A tiny playground page in the docs that runs `ipolypad-js` on an uploaded
      image entirely client-side (the demo already bundles the JS build).
