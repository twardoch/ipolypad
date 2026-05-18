---
layout: page
title: Python
permalink: /usage/python/
parent: Usage
nav_order: 1
---

# Python — `ipolypad`

The reference implementation. Smart input handling, multi-format output,
batch processing, and a Fire-based CLI.

## Install

```bash
# Run without installing
uvx ipolypad trace dragon.svg --out dragon.json

# Or install into a project
uv pip install ipolypad
```

## CLI

```bash
ipolypad trace <src> [options]
ipolypad batch '<glob>' --out-dir <dir> [options]
```

### Options

| Option              | Default | Notes                                          |
| ------------------- | ------- | ---------------------------------------------- |
| `--size`            | 200     | Raster canvas size (px, square).               |
| `--margin`          | 20      | Transparent gutter for dilation room.          |
| `--pad`             | 6       | Positive dilates; negative erodes, in pixels.  |
| `--pad_pct` / `--pad-pct` | — | Alternative: pad as a % of `size`.             |
| `--max-points`      | 32      | Final vertex cap.                              |
| `--samples-per-curve` | 4     | Bezier flattening.                             |
| `--hull / --no-hull` | true   | Convex envelope.                               |
| `--enhance / --no-enhance` | auto | Auto-contrast (on for raster, off for SVG). |
| `--bg-tolerance`    | 12      | ΔE threshold for colour-distance bg detection. |
| `--smart-mask`      | true    | Use content-aware masking (Otsu/ΔE/Sauvola).   |
| `--format`          | `json`  | One or more: `json,css,svg,png,html`.          |
| `--selector`        | —       | Wrap CSS in a selector block.                  |
| `--out`             | —       | Output path (or base path for multi-format).   |

`src` may be a local file path, an `http(s)://` URL, or a `data:` URL.

Padding is applied on an expanded working canvas, then normalized back to the
original image box. With large padding, CSS coordinates may be negative or
greater than `100%`; that is expected and preserves the actual padded hull.
Negative padding erodes the silhouette for tighter wraps.

### Examples

```bash
# Default JSON to stdout
ipolypad trace dragon.svg

# CSS rule with selector, written to a file
ipolypad trace dragon.svg --format css --selector ".figure" --out dragon.css

# Photograph with colour-distance background detection
ipolypad trace photo.jpg --enhance --bg-tolerance 14 --pad_pct 4

# Larger-than-image hull preview
ipolypad trace Dragon.svg --pad_pct 20 --format html > Dragon.html

# Multi-format in one go (writes dragon.json, dragon.css, dragon.svg)
ipolypad trace dragon.svg --format json,css,svg --out dragon

# Batch a folder in parallel
ipolypad batch 'icons/*.svg' --out-dir dist/ --max-points 24 --format json
```

## Library

```python
from ipolypad import trace

result = trace("dragon.svg", size=200, pad=6, max_points=32, format="json")
# result is a dict
print(result["points"])

# Write CSS directly
css = trace("dragon.svg", format="css", selector=".figure", out="dragon.css")
```

## Smart input handling

- **SVG**: rasterized at the requested size, root `width`/`height`/`style`
  stripped to neutralise Qt-exported CSS transforms.
- **PNG / WebP / GIF / TIFF / BMP** with alpha: Otsu-thresholded alpha,
  fallback to a fixed 24 cutoff if Otsu is degenerate.
- **JPEG / opaque images**: background colour estimated from the corner/edge
  ring, foreground = pixels whose perceptual distance (CIE ΔE on Lab) from
  background exceeds `--bg-tolerance` (default 12).
- **Pathological cases** (mask <2% or >98%): escalates to a Sauvola adaptive
  threshold on the L channel.

Pass `--no-smart-mask` to force the fixed `alpha > 24` JS-parity path.

## Pipeline reference

See [the spec]({{ '/spec/' | relative_url }}) §2 and §4 for the full
algorithmic description.
