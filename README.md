# ipolypad

Turn an image or SVG into a small, normalized **padded polygon hull** for CSS
`shape-outside`, `clip-path`, and HTML/canvas text-wrap engines such as
[`pretext-flow`](https://github.com/NourTheArab/pretext-flow). Typically
16–32 points, faithful to the silhouette plus a configurable visual padding.

[**Documentation**](https://code.twardoch.com/ipolypad/) ·
[**Live demo**](https://code.twardoch.com/ipolypad/demo/) ·
[**Spec**](./SPEC.md) ·
[Python on PyPI](https://pypi.org/project/ipolypad/) ·
[JS on npm](https://www.npmjs.com/package/ipolypad-js)

```text
image / SVG  →  rasterize  →  silhouette mask  →  pad (dilate)  →
                potrace  →  pick outer shell  →  convex hull  →
                simplify (RDP)  →  normalize  →  JSON / CSS
```

The output is intentionally low-fidelity: text-wrap engines don't need a
precise outline, they need a small polygon that hugs the visible shape with a
sensible visual gap.

Padding is not clipped to the source rectangle. Large pads can produce
negative CSS percentages or values above `100%`, which is the correct result
when the padded hull is larger than the image.

## Two implementations, one spec

- **[`ipolypad`](./ipolypad_py/)** (Python) — the reference. Smart input
  handling (Otsu / Lab ΔE / Sauvola), auto-contrast, batch processing, Fire
  CLI via `uvx ipolypad`. Emits `json` / `css` / `svg` / `png` / `html`.
- **[`ipolypad-js`](./ipolypad_js/)** (JavaScript) — browser-first subset.
  Small bundle (~20 KB ESM + lazy WASM potrace), assumes alpha-bearing input,
  fixed `alpha > 24` threshold. Emits `json` / `css`.

The asymmetry is deliberate. JS exists to ship small bytes to a browser;
Python exists to handle anything you throw at it. The two agree byte-for-byte
on the overlapping **parity surface** (SPEC §10), enforced by fixtures in
[`tests/parity/`](./tests/parity/). Everything outside that surface is
one-sided on purpose.

## Quick start

### Python

```bash
# Trace an SVG, write JSON
uvx ipolypad trace dragon.svg --pad 6 --max-points 32 --out dragon.json

# CSS rule for a selector
uvx ipolypad trace dragon.svg --format css --selector ".figure" --out dragon.css

# Photograph with colour-distance background detection
uvx ipolypad trace photo.jpg --enhance --bg-tolerance 14 --pad_pct 4

# Batch a folder in parallel
uvx ipolypad batch 'icons/*.svg' --out-dir dist/ --max-points 24
```

```python
from ipolypad import trace
result = trace("dragon.svg", size=200, pad=6, max_points=32)
print(result["points"])
```

### JavaScript

```bash
npm install ipolypad-js
```

```ts
import { ipolypad } from 'ipolypad-js';

const result = await ipolypad('/assets/dragon.svg', { pad: 6, maxPoints: 32 });
// { src, raster, max_points, n_points, points: [[x,y], ...] }

const css = await ipolypad(svgElement, { format: 'css', selector: '.figure' });
```

## Output

Default JSON:

```json
{
  "src": "dragon.svg",
  "raster": { "width": 200, "height": 200, "pad": 6 },
  "max_points": 32,
  "n_points": 18,
  "points": [[0.500000, 0.020000], [0.810000, 0.140000], "..."]
}
```

`points` are normalized against the source image's rasterization box (not the
polygon bounding box). Large padding may push coordinates below `0` or above
`1`, so CSS percentages can be negative or exceed `100%`.

CSS form:

```css
.figure {
  shape-outside: polygon(50.00% 2.00%, 81.00% 14.00%, /* ... */);
  clip-path:     polygon(50.00% 2.00%, 81.00% 14.00%, /* ... */);
}
```

## How it works

Eight stages. Both implementations agree on every numeric:

1. **Fetch** — local path / `http(s)://` / `data:` URL / in-memory bytes.
2. **Rasterize** — render SVG to `size×size` RGBA with a transparent
   `margin`-px gutter; strip root `width`/`height`/`style` from SVG (Qt
   exports embed inverting CSS transforms).
3. **Mask** — JS: fixed `alpha > 24`. Python: Otsu on alpha, with
   Lab-ΔE-from-background fallback for opaque inputs and Sauvola escalation
   for pathological cases.
4. **Pad** — expand the working canvas by the pad amount, then perform circular
   binary dilation (Euclidean structuring element, not Manhattan — round shapes
   deserve round padding).
5. **Trace** — potrace with `turdsize=2, turnpolicy=0, alphamax=1.0`,
   then flatten beziers at 4 samples per curve.
6. **Outer shell** — pick the largest curve whose area is < 95% of the
   canvas (the ≥ 95% curves are potrace's bitmap-frame artifacts).
7. **Hull** — Andrew's monotone-chain convex hull. On by default — most
   CSS/text-wrap consumers compute per-band `[leftX, rightX]` intervals and
   so behave as their convex envelope anyway; feeding the hull eliminates
   the dead zones where a back-side vertex pushes a band's edge out
   needlessly.
8. **Simplify** — Ramer–Douglas–Peucker with binary search on `ε` to hit a
   target vertex count. Drops the trailing closing duplicate first (without
   that, the degenerate two-endpoint line collapses every perpendicular
   distance to zero and RDP returns nothing).

Read [`SPEC.md`](./SPEC.md) for the full contract: inputs, defaults, error
model, cross-language parity, performance targets.

## Repository

```text
.
├── SPEC.md             # authoritative specification
├── README.md           # this file
├── CLAUDE.md           # guidance for AI assistants
├── build.sh            # builds both packages
├── publish.sh          # publishes both (PyPI + npm) — gated by a git tag
├── ipolypad_py/        # Python reference implementation
├── ipolypad_js/        # JavaScript subset (browser-first)
├── docs/               # Jekyll site → code.twardoch.com/ipolypad/
│   └── demo/           # interactive drag-drop demo with pretext-flow
├── tests/parity/       # cross-language fixtures
└── private/
    └── svg2polygon.py  # original prototype, reference numerics
```

## Develop

```bash
# Release-style build: requires a clean product tree, regenerates docs demo bundle,
# cleans Python artifacts, builds both packages, then runs all tests.
./build.sh

# Python only
cd ipolypad_py && uv pip install -e ".[test]" && pytest

# JS only
cd ipolypad_js && npm install && npm test

# Cross-language parity (requires both installed + node on PATH)
pytest tests/parity/
```

## Versioning & release

A single git tag releases both packages. Use `uvx gitnextver` to cut the next
tag, then `./publish.sh` to push to PyPI + npm. The publish script refuses to
run unless HEAD has an exact tag and the product tree is clean.

Python versions come from `hatch-vcs`; the generated
`ipolypad_py/src/ipolypad/__version__.py` is ignored and must not be committed.
The npm package is staged with the git tag version during publish, so
`package.json` does not need a release-only edit.

## Acknowledgements

- [Peter Selinger's potrace](http://potrace.sourceforge.net/) — the trace.
- [`potracer`](https://pypi.org/project/potracer/) — pure-Python port.
- [`esm-potrace-wasm`](https://www.npmjs.com/package/esm-potrace-wasm) —
  WASM build for the browser.
- [`resvg`](https://github.com/RazrFalcon/resvg) — SVG rasterization
  (both `resvg_py` and the browser's native SVG-to-canvas).
- [`pretext`](https://github.com/chenglou/pretext) +
  [`pretext-flow`](https://github.com/NourTheArab/pretext-flow) — the
  consumer that motivated this tool, shown in the demo.

## License

Apache-2.0. See [LICENSE](./LICENSE).
