---
layout: page
title: JavaScript
permalink: /usage/javascript/
parent: Usage
nav_order: 2
---

# JavaScript — `ipolypad-js`

Browser-first subset of the spec. Small bundle, fixed `alpha > 24` threshold,
JSON / CSS output only. Use this when you want client-side polygons that
work with `pretext-flow` or CSS `shape-outside`.

## Install

```bash
npm install ipolypad-js
```

## Use

```ts
import { ipolypad } from 'ipolypad-js';

// URL, data: URL, Uint8Array, Blob, SVGElement, or HTMLImageElement
const result = await ipolypad('/assets/dragon.svg', {
  size: 200,
  pad: 6,
  maxPoints: 32,
});
// {
//   src: '/assets/dragon.svg',
//   raster: { width: 200, height: 200, pad: 6 },
//   max_points: 32,
//   n_points: 18,
//   points: [[0.500000, 0.020000], ...]
// }

// CSS string
const css = await ipolypad(svgElement, {
  format: 'css',
  selector: '.figure',
});
```

## Options

| Option            | Default | Notes                                  |
| ----------------- | ------- | -------------------------------------- |
| `size`            | 200     | Raster canvas size (px, square).       |
| `margin`          | 20      | Transparent gutter for dilation.       |
| `pad`             | 6       | Positive dilates; negative erodes.     |
| `maxPoints`       | 32      | Final vertex cap.                      |
| `samplesPerCurve` | 4       | Bezier flatten samples.                |
| `hull`            | true    | Apply convex envelope.                 |
| `format`          | `'json'`| `'json'` or `'css'`.                   |
| `selector`        | —       | Wrap CSS in a selector block.          |

Padding is applied on an expanded working canvas, then normalized back to the
original image box. Large pads can produce points outside `[0, 1]`, which turn
into negative CSS percentages or values above `100%`.
Negative padding erodes the silhouette for tighter wraps.

## What's deliberately out

The JS package does NOT do colour-distance background detection,
auto-contrast, adaptive thresholding, batch processing, or SVG/PNG/HTML
output. Those live in [Python]({{ '/usage/python/' | relative_url }}) on
purpose. See [SPEC §5]({{ '/spec/' | relative_url }}#5-js-subset--whats-intentionally-out).

## Inputs accepted

- A URL string (`/foo.svg`, `https://example.com/img.png`)
- A `data:` URL
- Inline SVG markup
- `Uint8Array` or `Blob`
- An `<svg>` element from the DOM
- A pre-loaded `<img>` element

## Bundle size

The compiled ESM bundle is ~20 KB. The WASM-backed `esm-potrace-wasm`
loads lazily on first call.

## Integrating with pretext-flow

The polygon's `points` array (or the polygon's CSS form) feeds directly into
[`pretext-flow`](https://github.com/NourTheArab/pretext-flow). See the
[demo]({{ '/demo/' | relative_url }}) for a runnable example with drag-drop.
