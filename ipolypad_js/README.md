# ipolypad-js

Browser-first subset of the [`ipolypad`](https://github.com/twardoch/ipolypad)
spec. Turns an SVG or PNG into a padded polygon hull for CSS `shape-outside`
and HTML/canvas text-wrap engines like
[`pretext-flow`](https://github.com/NourTheArab/pretext-flow).

Small, focused, intentionally a strict subset of the Python reference —
see [`SPEC.md`](https://github.com/twardoch/ipolypad/blob/main/SPEC.md) §5.

## Install

```bash
npm install ipolypad-js
```

## Use

```ts
import { ipolypad } from 'ipolypad-js';

// URL / Blob / Uint8Array / SVGElement / HTMLImageElement all accepted.
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

const css = await ipolypad(svgElement, { format: 'css', selector: '.figure' });
```

## Options

| Option            | Default | Notes                                    |
| ----------------- | ------- | ---------------------------------------- |
| `size`            | 200     | Raster canvas size (px, square).         |
| `margin`          | 20      | Transparent gutter for dilation room.    |
| `pad`             | 6       | Dilation radius in pixels.               |
| `maxPoints`       | 32      | Final vertex cap.                        |
| `samplesPerCurve` | 4       | Bezier flatten samples.                  |
| `hull`            | true    | Apply convex envelope.                   |
| `format`          | 'json'  | `'json'` or `'css'`.                     |
| `selector`        | —       | Wrap CSS in a selector block.            |

## What's deliberately not here

The JS package assumes alpha-bearing input (SVG or PNG with transparency) and
uses a fixed `alpha > 24` threshold. It does **not** do colour-distance
background detection, auto-contrast, adaptive thresholding, batch processing,
or SVG/PNG/HTML output. Those live in the Python package on purpose. See
[SPEC §5](https://github.com/twardoch/ipolypad/blob/main/SPEC.md#5-js-subset--whats-intentionally-out).

## Cross-language parity

On the parity surface (PNG-with-alpha or SVG input, identical options),
this package produces byte-identical `json` and `css` output to the Python
implementation. Enforced by fixtures in `tests/parity/`.

## License

Apache-2.0.
