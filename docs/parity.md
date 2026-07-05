---
layout: page
title: Parity surface
nav_order: 4
---

# Parity surface

ipolypad ships two independent implementations — Python (`ipolypad`) and
JavaScript (`ipolypad-js`). They are **not** feature-equivalent by design (see
[Which implementation?](#which-implementation) below), but the features they
*share* are held to a strict contract: **identical input on the parity surface
must produce byte-identical output.** This page states exactly what that
guarantee covers, and what it does not.

The authoritative definition lives in [SPEC §10](./spec/); this page is the
reader-friendly summary.

## What is guaranteed byte-identical

Given the same normalized polygon and the same emit options, both
implementations produce byte-identical output for:

| Surface | Guarantee |
|---------|-----------|
| `json` output | Identical text: same key order, same array shape, points rounded to **6 decimals** |
| `css` output  | Identical text: same selector formatting, percentages rounded to **2 decimals** |
| Point normalization | Same coordinate system (fractions of the source image box) |
| Rounding rules | 6 decimals for JSON points, 2 decimals for CSS percentages, half-up |

This is enforced by fixtures in [`tests/parity/`](https://github.com/twardoch/ipolypad/tree/main/tests/parity):

- **Formatter parity** (`test_parity_formatters.py`) feeds fixed polygons into
  each implementation's `to_json` / `to_css` and asserts byte equality. This is
  the contractual layer and runs on every CI build.
- **End-to-end parity** (opt-in via `RUN_E2E=1`) runs the full pipeline on
  shared SVG fixtures. It depends on two different potrace bindings
  (Python `potracer` vs the `esm-potrace-wasm` WASM build) tracing identically,
  which they should but which is not contractually guaranteed across upstream
  versions. Marked best-effort.

## What is deliberately *not* on the parity surface

These are one-sided on purpose — using them is not a parity violation, it's just
outside the shared contract:

- **Smart input handling** (Python only): colour-distance background detection,
  auto-contrast, Otsu / Lab ΔE / Sauvola adaptive thresholding. JS assumes
  alpha-bearing input with a fixed `alpha > 24` threshold.
- **Output formats** (Python only): `svg`, `png`, `html`. JS emits `json` /
  `css` only.
- **Batch processing and the Fire CLI**: Python only.
- **Raster input formats**: Python accepts more than JS (SPEC §1.2).

If you feed an alpha-bearing PNG through the shared path with matching options,
you land on the parity surface and the outputs must match. If you rely on Otsu
thresholding or PNG emission, you have left it — and only Python can help you.

## Which implementation?

- **Use `ipolypad-js`** in the browser or any bundle-size-sensitive context.
  It is a small ESM module with lazy-loaded WASM potrace, and it assumes clean
  alpha-bearing input.
- **Use `ipolypad` (Python)** for CI, batch jobs, and messy real-world inputs
  (photos without alpha, low-contrast art, mixed formats), or when you need
  `svg` / `png` / `html` output.

When you need the *same* polygon in both a browser and a build step — for
example precomputing a `shape-outside` in Python CI and re-deriving it live in
JS — the parity surface is what makes that safe.

## Changing the numerics

Any change to the shared numeric pipeline — potrace parameters, the RDP
threshold search, the hull algorithm, normalization, or rounding — **must** be
applied to both implementations in the same change and validated against the
parity suite. Silent divergence is the exact failure mode this repository
exists to prevent.
