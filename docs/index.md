---
layout: page
title: ipolypad
description: Image or SVG → padded polygon hull for CSS shape-outside and canvas text-wrap.
permalink: /
has_toc: false
---

<link rel="stylesheet" href="{{ '/assets/css/ipolypad.css' | relative_url }}">

<section class="ipolypad-hero">
  <p class="ipolypad-hero__lede">
    <strong>ipolypad</strong> turns an image or SVG into a small, normalized
    polygon hull (16–32 points) ideal for CSS <code>shape-outside</code> and
    HTML/canvas text-wrap engines. Two implementations share one spec.
  </p>
</section>

## What it does

```text
image / SVG  →  rasterize  →  silhouette mask  →  pad (dilate)  →
                potrace  →  pick outer shell  →  convex hull  →
                simplify (RDP)  →  normalize  →  JSON / CSS
```

The output is intentionally low-fidelity: text-wrap algorithms don't need
a precise outline, they need a small polygon that hugs the visible shape with
a sensible visual gap. ~32 vertices is the sweet spot.

## Pick your language

- [Python]({{ '/usage/python/' | relative_url }}) — reference. Smart input
  handling (colour-distance background detection, auto-contrast, adaptive
  thresholding), CLI via `uvx ipolypad`, emits `json`/`css`/`svg`/`png`/`html`.
- [JavaScript]({{ '/usage/javascript/' | relative_url }}) — browser-first.
  Strict subset, small bundle, assumes alpha-bearing input, emits `json`/`css`.

For the full algorithmic contract see [the specification]({{ '/spec/' | relative_url }}).

## Try it

The [interactive demo]({{ '/demo/' | relative_url }}) lets you drop in an SVG
or PNG, runs `ipolypad-js` in the browser, and reflows a passage of text
around the resulting polygon via [`pretext-flow`](https://github.com/NourTheArab/pretext-flow).

## Output

Default JSON:

```json
{
  "src": "dragon.svg",
  "raster": { "width": 200, "height": 200, "pad": 6 },
  "max_points": 32,
  "n_points": 18,
  "points": [[0.500000, 0.020000], ...]
}
```

CSS:

```css
.figure {
  shape-outside: polygon(50.00% 2.00%, 81.00% 14.00%, /* ... */);
  clip-path:     polygon(50.00% 2.00%, 81.00% 14.00%, /* ... */);
}
```

## Asymmetric by design

The Python package is the smart one — colour analysis, auto-contrast, batch,
multi-format output. The JavaScript package is intentionally a strict subset
so it stays small enough to ship to a browser. They agree byte-for-byte on
the overlapping parity surface; everything else is one-sided on purpose.

## License

Apache-2.0. See the [GitHub repo](https://github.com/twardoch/ipolypad).
