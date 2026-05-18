# ipolypad

Turn an image or SVG into a **padded polygon hull** for CSS `shape-outside`,
`clip-path`, and text-wrap engines. Small (16–32 points), normalized (0..1),
faithful to the silhouette plus a configurable visual padding.

Two implementations, one spec:

- **[`ipolypad_py`](./ipolypad_py/)** — Python reference. Smart input handling
  (colour-distance background detection, auto-contrast, adaptive thresholding),
  CLI via `uvx ipolypad`, emits `json` / `css` / `svg` / `png` / `html`.
- **[`ipolypad_js`](./ipolypad_js/)** — JavaScript subset. Browser-first, small
  bundle, assumes alpha-bearing input, emits `json` / `css`. Built for the web.

The full specification — pipeline, options, defaults, error model,
cross-language parity contract — is in **[`SPEC.md`](./SPEC.md)**.

## What it does

```text
image / SVG  →  rasterize  →  silhouette mask  →  pad (dilate)  →
                potrace  →  pick outer shell  →  convex hull  →
                simplify (RDP)  →  normalize  →  JSON / CSS
```

The output is intentionally low-fidelity: text-wrap algorithms don't need a
precise outline, they need a small polygon that hugs the visible shape with a
sensible visual gap. ~32 vertices is the sweet spot.

## Quick taste

### Python

```bash
uvx ipolypad trace dragon.svg --pad 6 --max-points 32 --out dragon.json
uvx ipolypad trace photo.jpg --enhance --bg-tolerance 12 --format css --selector .figure
```

### JavaScript (browser)

```ts
import { ipolypad } from 'ipolypad-js';

const result = await ipolypad('/assets/dragon.svg', { pad: 6, maxPoints: 32 });
// { src, raster: {width, height, pad}, max_points, n_points, points: [[x,y], ...] }

const css = await ipolypad(svgElement, { format: 'css', selector: '.figure' });
```

## Asymmetric on purpose

The JS package is **deliberately a strict subset** of the Python one. JS exists
to ship small bytes to a browser; Python exists to handle anything you throw
at it. Features that live only in Python (colour analysis, auto-contrast,
SVG/PNG/HTML emission, batch mode) are listed in SPEC §4. Features that live
only in JS (DOM-element inputs) are in SPEC §5.

The two implementations share a **parity surface** (SPEC §10): on overlapping
inputs and options, they produce byte-identical `json` and `css` output.
That contract is enforced by fixtures in `tests/parity/`.

## Output

Default JSON payload:

```json
{
  "src": "dragon.svg",
  "raster": { "width": 200, "height": 200, "pad": 6 },
  "max_points": 32,
  "n_points": 18,
  "points": [[0.500000, 0.020000], [0.810000, 0.140000], "..."]
}
```

`points` are normalized 0..1 against the rasterization box (not the polygon
bounding box), so CSS `polygon()` percentages line up with the source image's
display rectangle.

CSS form:

```css
.figure {
  shape-outside: polygon(50.00% 2.00%, 81.00% 14.00%, /* ... */);
  clip-path:     polygon(50.00% 2.00%, 81.00% 14.00%, /* ... */);
}
```

## Repository layout

```text
.
├── SPEC.md             # authoritative specification — read this
├── CLAUDE.md           # guidance for AI assistants
├── ipolypad_py/        # Python package (not yet scaffolded)
├── ipolypad_js/        # JS package (not yet scaffolded)
├── tests/parity/       # cross-language fixtures
└── private/
    └── svg2polygon.py  # original prototype, reference numerics
```

## Status

Greenfield. The prototype in `private/svg2polygon.py` is the working reference
implementation; the published packages are not yet scaffolded. `SPEC.md`
defines what to build. Contributions should update `SPEC.md` first.

## License

See [LICENSE](./LICENSE).
