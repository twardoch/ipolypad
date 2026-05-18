---
layout: page
title: Specification
permalink: /spec/
nav_order: 3
---

# Specification

The authoritative spec lives in
[`SPEC.md`](https://github.com/twardoch/ipolypad/blob/main/SPEC.md) at the
repository root and is the source of truth for both implementations.

It covers:

- §1 — Accepted inputs (Python vs JS)
- §2 — The eight-stage pipeline (fetch → rasterize → mask → pad → trace
  → outer-shell → simplify → emit)
- §3 — Output formats and exact serialisation rules
- §4 — Python-only "smart" features (colour-distance bg detection,
  auto-contrast, adaptive thresholding, batch)
- §5 — The JavaScript subset (what's deliberately not there)
- §6 — Defaults table
- §7 — CLI surface
- §8 — Error model
- §9 — Determinism and reproducibility rules
- §10 — Cross-language **parity contract**: byte-identical JSON / CSS on the
  shared surface
- §11 — Performance targets
- §12 — Target repository layout
- §13 — Versioning (single git tag releases both packages)

If the spec and an implementation disagree, the spec wins. PRs should update
the spec before changing behaviour.

[Read the full spec on GitHub →](https://github.com/twardoch/ipolypad/blob/main/SPEC.md)
