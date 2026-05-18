# ipolypad

Convert an image or SVG into a **padded polygon hull** suitable for CSS
`shape-outside` and HTML/canvas text-wrap engines. Reference implementation.

See the project root [`README.md`](../README.md) and [`SPEC.md`](../SPEC.md) for
the full design. This package is the Python side — smart, batteries-included,
multi-format output.

## Install

```bash
uvx ipolypad trace dragon.svg --pad 6 --max-points 32 --out dragon.json
# or
uv pip install ipolypad
```

## CLI

```bash
ipolypad trace <src> [--size 200] [--pad 6] [--max-points 32] \
                     [--hull / --no-hull] [--format json,css,svg,png,html] \
                     [--enhance / --no-enhance] [--bg-tolerance 12] \
                     [--selector .figure] [--out path]

ipolypad batch '*.svg' --out-dir dist/ [trace options...]
```

`src` may be a local path, an `http(s)://` URL, or a `data:` URL.

## Library

```python
from ipolypad import trace

result = trace("dragon.svg", size=200, pad=6, max_points=32, format="json")
print(result["points"])
```

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

`points` are normalized 0..1 against the rasterization box, six decimals,
no trailing closing vertex (polygon is implicitly closed).

## License

Apache-2.0. See [LICENSE](../LICENSE).
