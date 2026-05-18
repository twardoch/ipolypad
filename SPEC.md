# ipolypad — Specification

**Status:** draft. Authoritative source for both implementations.

`ipolypad` turns an image (raster or SVG) into a **padded polygon hull** suitable
for CSS `shape-outside`, `clip-path`, and HTML/canvas text-wrap algorithms.
Output is small (typically 16–32 points), normalized (0..1), and faithful to
the visible silhouette plus a configurable visual padding.

Two implementations exist:

- **`ipolypad_py`** (Python) — reference; smart, batteries-included, multi-format
  output. Targets CLI + scripting via `uvx ipolypad`.
- **`ipolypad_js`** (JavaScript) — strict subset, browser-first, minimal deps.
  Trades features for code size, deterministic behaviour, and embeddability.

The two implementations **MUST** produce byte-identical `json` output for the
overlapping feature set (see §10) given the same inputs. Differences outside
that set are allowed only where this spec says so.

---

## 1. Inputs

### 1.1 Accepted source types

| Form              | Python | JS  | Notes                                          |
| ----------------- | ------ | --- | ---------------------------------------------- |
| Local file path   | ✅     | ❌  | JS runs in the browser; no filesystem.         |
| `http(s)://` URL  | ✅     | ✅  | JS uses `fetch`; CORS applies.                 |
| `data:` URL       | ✅     | ✅  | Decoded directly.                              |
| In-memory bytes   | ✅     | ✅  | Python: `bytes`; JS: `Uint8Array`/`Blob`.      |
| `HTMLImageElement`/`SVGElement` | ❌     | ✅  | JS convenience for DOM-resident sources. |
| `Buffer`          | ❌     | ✅¹ | ¹ Node usage permitted but not the focus.      |

### 1.2 Accepted content types

- SVG (`image/svg+xml`, `.svg`, or starts with `<`).
- PNG (`image/png`).
- Python additionally accepts: JPEG, WebP, GIF, BMP, TIFF — anything Pillow opens.
- JS accepts only SVG and PNG. JPEG/WebP/etc. are out of scope.

Detection is content-based first (sniff first few bytes / leading `<`),
falling back to filename extension.

---

## 2. Pipeline

```
fetch → rasterize → mask → (color-aware) → pad (dilate) → trace → outer-shell pick → hull? → simplify → normalize → emit
```

Both implementations follow the same eight stages. They differ only in
**what each stage is allowed to do** (see §4 vs §5).

### 2.1 Fetch

Resolve the source to raw bytes plus a guessed content type.

### 2.2 Rasterize

Render SVG to RGBA at an internal canvas size of `size × size` with a transparent
`margin`-px gutter on every side. The actual SVG render box is
`inner = max(8, size − 2·margin)`. Raster inputs are scaled to fit `inner × inner`
preserving aspect, then pasted centered onto the transparent canvas. The gutter
exists so dilation (§2.4) has room to grow without clipping or wrapping at the
canvas edges.

**SVG sanitization (both):** strip root-level `width`, `height`, and inline
`style="..."` attributes from the outermost `<svg>` so renderer-honoured CSS
transforms (notably Qt-exported `transform: scale(-1,1)`) don't push content
outside the viewBox.

### 2.3 Mask

Extract the alpha channel. Any pixel with `alpha > 24` becomes foreground.
This single fixed threshold is intentional — see §4.1 for the Python override.

### 2.4 Pad (binary dilation)

Dilate the binary mask by `pad` pixels using a **circular** structuring element
of radius `pad`. The fixed Manhattan/cross structuring element used by many
naive implementations is wrong here — it produces square corners on round
silhouettes. Use Euclidean distance: `(x² + y²) ≤ r²`.

Padding is expressed externally as a percentage of `size`; convert to pixels at
the boundary: `pad_px = round(pad_pct / 100 · size)`.

### 2.5 Trace

Run potrace on the binary mask. Required potrace parameters (both):
`turdsize=2`, `turnpolicy=0`, `alphamax=1.0`.

Flatten cubic-bezier segments into polylines at `samples_per_curve` samples
(default 4). Corner segments contribute their corner vertex and end vertex
directly.

### 2.6 Outer-shell pick

Potrace returns multiple curves (outer boundary + inner holes + possibly the
canvas frame itself). The selection rule is:

1. Compute signed area of each curve.
2. Discard any curve whose area is `≥ 95%` of the canvas area — that's the
   potrace bitmap-frame artifact.
3. From what remains, pick the **single largest by area**.

Error exit if nothing remains.

### 2.7 Hull (optional, default ON)

Apply Andrew's monotone-chain convex hull. Justification: most CSS/text-wrap
consumers (CSS `shape-outside`, `pretext-flow`, etc.) compute per-band
`[leftMostX, rightMostX]` intervals — concave polygons silently behave as
their convex envelope, but with phantom "dead zones" where a back-side vertex
pushes a band's edge out unnecessarily. Feeding the hull eliminates dead zones
and yields cleaner `polygon()` declarations.

Both implementations default to `hull=true`. Both **must** expose a way to
disable it.

### 2.8 Simplify (RDP, vertex-count-targeted)

Ramer–Douglas–Peucker simplification with binary search on `ε` to hit
`max_points` (default 32). The search range is `[0, 0.25 · bbox_diag]` over
24 iterations.

Before RDP, drop a trailing duplicate-closing vertex if present, otherwise the
degenerate two-endpoint line collapses every perpendicular distance to zero
and the algorithm returns nothing.

### 2.9 Normalize

Divide every `(x, y)` by `(canvas_w, canvas_h)` — i.e. the rasterization box,
**not** the polygon bounding box. This keeps the polygon registered against
the source media's display rectangle so CSS `polygon()` percentages line up
with the original image bounds.

### 2.10 Emit

Format the polygon as one of: `json` (both), `css` (both), `svg` / `png` / `html`
(Python only).

---

## 3. Output formats

### 3.1 `json` (default; both implementations)

```json
{
  "src": "<input identifier>",
  "raster": { "width": 200, "height": 200, "pad": 6 },
  "max_points": 32,
  "n_points": 18,
  "points": [[0.5, 0.02], [0.81, 0.14], ...]
}
```

- `points` are normalized 0..1, CCW ordering when `hull=true`.
- Trailing closing vertex is **not** included; the polygon is implicitly closed.
- Floats serialized with the language default repr — for cross-language match
  use the rounding rule in §10.

### 3.2 `css` (both)

When `selector` is omitted, emit just the polygon expression:

```
polygon(50.00% 2.00%, 81.00% 14.00%, ...);
```

When `selector` is provided, emit a full rule:

```css
.target {
  shape-outside: polygon(50.00% 2.00%, 81.00% 14.00%, ...);
  clip-path:     polygon(50.00% 2.00%, 81.00% 14.00%, ...);
}
```

Coordinates: 2 decimal places, percent-formatted.

### 3.3 Python-only formats

- **`svg`** — `<svg viewBox="0 0 W H">` with one `<polygon points="...">`,
  dimensioned to fit the source image's natural size.
- **`png`** — rasterized version of the `svg` form at the requested `size`.
- **`html`** — small standalone HTML file embedding the source image and
  overlaying the traced polygon (semi-transparent fill) for visual QA.

These formats are reference/diagnostic tools and stay Python-only by design.

---

## 4. Python-only smarts

The Python implementation is allowed — encouraged — to be smarter than JS.

### 4.1 Color-aware foreground detection

Replace the fixed `alpha > 24` rule with a content-aware policy:

- **Has alpha** (PNG/SVG/WebP with transparency): use alpha threshold but
  auto-calibrate via Otsu on the alpha channel; fall back to 24 if Otsu is
  degenerate.
- **No alpha** (JPEG, opaque PNG): determine background by sampling the four
  corners + edge ring; cluster to find the dominant background colour; emit
  the binary mask as "pixels whose distance from background colour in
  perceptually-uniform space (CIE Lab ΔE) exceeds a threshold". Tunable via
  `--bg-tolerance` (default ΔE ≈ 12).
- **Dark-on-dark / light-on-light** edge cases: if both candidate masks
  (alpha vs colour) produce <2% or >98% foreground coverage, escalate to a
  Sauvola/Niblack adaptive threshold on the L channel.

### 4.2 Smart darken + auto-contrast

Optional `--enhance` (default ON for raster, OFF for SVG — SVG comes from a
designed source and rarely needs it):

- Auto-levels: stretch L channel to [P2, P98].
- Mild gamma (γ ≈ 0.85) toward darker midtones to make near-background pixels
  cross the threshold.
- Cap at one pass — repeated enhancement chases its own tail.

### 4.3 Smarter libraries permitted

- Pillow + NumPy + SciPy for everything image-side (already in prototype).
- `scikit-image` allowed for `filters.threshold_otsu`, `filters.threshold_sauvola`,
  `color.rgb2lab`. Add only if needed.
- `shapely` allowed for hull / simplification cross-checks but **not** as the
  primary simplifier — keep RDP for cross-language match.

### 4.4 Multi-format emission in one run

Accept `--format json,css,svg,png,html` (comma-separated) and emit all to
sibling files based on `--out`.

### 4.5 Batch mode

`uvx ipolypad batch <glob> --out-dir dist/` — process many files in parallel
(`concurrent.futures.ProcessPoolExecutor`).

---

## 5. JS subset — what's intentionally out

The JS package is web-first and **small**. It must:

- Bundle to ≤ ~50 KB gzipped including its potrace and resvg dependencies
  (they're WASM-loaded on demand; that's fine).
- Have zero Node-only imports.
- Expose one primary API: `ipolypad(input, options) → Promise<Result>`.

What JS does **NOT** do (and won't):

- ❌ Colour-distance background detection (assumes alpha-bearing input).
- ❌ Auto-contrast / gamma.
- ❌ Adaptive thresholding.
- ❌ `svg` / `png` / `html` output.
- ❌ Batch / glob.
- ❌ Multiple formats per call (call again for the other one).
- ❌ Filesystem.

What JS does:

- ✅ Fetch SVG or PNG from URL / Blob / Uint8Array / SVGElement / HTMLImageElement.
- ✅ Rasterize via `@resvg/resvg-js` (SVG) or `<canvas>` (PNG/image element).
- ✅ Fixed `alpha > 24` mask, circular dilation, potrace via `esm-potrace-wasm`.
- ✅ Outer-shell pick, optional convex hull, RDP simplification.
- ✅ `json` (default) or `css` output.

### 5.1 JS public API

```ts
type Source = string | Uint8Array | Blob | SVGElement | HTMLImageElement;

interface Options {
  size?: number;          // default 200
  margin?: number;        // default 20
  pad?: number;           // default 6 (in px, NOT %, for parity with Python)
  maxPoints?: number;     // default 32
  samplesPerCurve?: number; // default 4
  hull?: boolean;         // default true
  format?: 'json' | 'css'; // default 'json'
  selector?: string;      // for 'css'
}

interface JsonResult {
  src: string;
  raster: { width: number; height: number; pad: number };
  max_points: number;
  n_points: number;
  points: [number, number][];
}

function ipolypad(input: Source, options?: Options): Promise<JsonResult | string>;
```

When `format: 'css'`, the return type is the CSS string.

### 5.2 JS naming convention

External JSON uses snake_case keys (`max_points`, `n_points`) for cross-language
parity. JS options are camelCase. The boundary mapping is fixed:

| JS option         | JSON field   |
| ----------------- | ------------ |
| `maxPoints`       | `max_points` |
| `samplesPerCurve` | (internal)   |

---

## 6. Defaults

| Parameter           | Default | Range     | Notes                                  |
| ------------------- | ------- | --------- | -------------------------------------- |
| `size`              | 200     | 64–1024   | Raster canvas size (px, square).       |
| `margin`            | 20      | 0–size/4  | Transparent gutter for dilation room.  |
| `pad`               | 6 (px)  | 0–size/4  | Dilation radius.                       |
| `pad_pct` (CLI)     | 3%      | 0–25%     | Alternative entry; `pad_px = pad_pct/100·size`. |
| `max_points`        | 32      | 4–256     | Final vertex cap.                      |
| `samples_per_curve` | 4       | 1–16      | Bezier flattening.                     |
| `hull`              | true    | bool      | Convex envelope.                       |
| `format`            | `json`  | enum      | See §3.                                |

---

## 7. CLI (Python only)

```
uvx ipolypad trace <src> [--size 200] [--pad 6] [--max-points 32]
                        [--hull/--no-hull] [--format json,css,svg]
                        [--enhance/--no-enhance] [--bg-tolerance 12]
                        [--selector .target] [--out path]

uvx ipolypad batch <glob> --out-dir <dir> [trace options...]
```

Fire-driven. `__main__.py` exposes `trace` and `batch` subcommands.

---

## 8. Errors

Both implementations surface the same conditions:

| Condition                                    | Error class / behaviour                        |
| -------------------------------------------- | ---------------------------------------------- |
| Source unfetchable / 4xx / 5xx               | `SourceError` (Python) / rejected Promise (JS) |
| Unsupported content type                     | `FormatError`                                  |
| Empty mask (no foreground above threshold)   | `EmptyMaskError` — suggest lowering threshold  |
| Trace returns zero curves                    | `TraceEmptyError`                              |
| All curves ≥ 95% canvas (only frame)         | `OnlyFrameError`                               |

CLI exit codes (Python): 0 OK, 2 input error, 3 pipeline error.

---

## 9. Determinism & reproducibility

- Both implementations must be deterministic given the same input bytes and
  options. No RNG, no timestamps, no host-dependent rounding.
- All floating-point math uses double precision.
- `points` are emitted with **6 decimal places** in `json` to nail down
  cross-implementation match (§10).
- CSS percentages use 2 decimal places.

---

## 10. Cross-language parity contract

The following inputs and options form the **parity surface**:

- Input: PNG bytes with alpha, OR SVG bytes (UTF-8).
- Options: `size`, `margin`, `pad` (px), `max_points`, `samples_per_curve`,
  `hull`, `format` ∈ {`json`, `css`}, `selector`.

Given identical input bytes and options on this surface, Python and JS MUST
produce:

- `json`: byte-identical after JSON canonicalization (UTF-8, no BOM, sorted
  keys, points rounded to 6 decimals, no trailing whitespace).
- `css`: byte-identical (2 decimals, exact spacing per §3.2).

A `tests/parity/` directory holds fixtures + a runner that exercises both
implementations on a shared corpus and diffs the outputs. CI runs it on every
PR.

Permitted divergences:

- Python with `--enhance`, `--bg-tolerance`, `--format svg/png/html`, `batch`,
  raster inputs other than PNG: all outside parity surface.
- JS-only convenience inputs (`SVGElement`, `HTMLImageElement`): outside parity
  surface; they reduce to PNG/SVG bytes before entering the pipeline.

---

## 11. Performance targets

| Operation                        | Python (M1) | JS (M1, browser) |
| -------------------------------- | ----------- | ---------------- |
| 200×200 SVG → JSON, cold         | ≤ 200 ms    | ≤ 400 ms¹        |
| 200×200 SVG → JSON, warm         | ≤ 80 ms     | ≤ 60 ms          |
| Batch 100× 200×200 SVG (Python)  | ≤ 8 s       | n/a              |

¹ JS cold time dominated by WASM init (potrace + resvg). Subsequent calls
reuse the loaded WASM. Web consumers should call once per page load to warm
the modules.

---

## 12. Repository layout (target)

```
.
├── README.md
├── SPEC.md                    # this file
├── CLAUDE.md
├── LICENSE
├── build.sh                   # builds both packages
├── publish.sh                 # publishes both packages
├── ipolypad_py/
│   ├── pyproject.toml         # hatch-vcs, fire, resvg-py, potracer, pillow, numpy, scipy, scikit-image
│   ├── src/ipolypad/
│   │   ├── __init__.py
│   │   ├── __main__.py        # Fire CLI
│   │   ├── pipeline.py        # core pipeline (mirrors §2)
│   │   ├── color.py           # §4.1, §4.2
│   │   ├── trace.py           # potrace + flatten
│   │   ├── simplify.py        # RDP, hull
│   │   └── emit.py            # json/css/svg/png/html
│   └── tests/
├── ipolypad_js/
│   ├── package.json           # @resvg/resvg-js, esm-potrace-wasm
│   ├── src/
│   │   ├── index.ts
│   │   ├── pipeline.ts
│   │   ├── trace.ts
│   │   ├── simplify.ts
│   │   └── emit.ts
│   └── tests/
├── tests/parity/              # cross-language fixtures
└── private/
    └── svg2polygon.py         # original prototype (reference)
```

---

## 13. Versioning

- Python: `hatch-vcs`, git tag = source of truth, `ipolypad_py/src/ipolypad/__version__.py`
  generated and gitignored.
- JS: same git tags drive `package.json` `version` via release script
  (`scripts/sync-version.mjs` reads `git describe --tags --abbrev=0`).
- A single tag releases both packages. `uvx gitnextver` handles the tag.

---

## 14. Out of scope

- Multi-polygon output (we always pick the largest non-frame curve).
- Concave hull algorithms / α-shapes.
- Live preview UIs.
- Non-Web/Non-CLI deliverables (no native bindings, no language ports beyond
  these two).
