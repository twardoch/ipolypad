"""Output formatters. SPEC §3."""
# this_file: ipolypad_py/src/ipolypad/emit.py
from __future__ import annotations

import io
import json
import re
from typing import Any

Point = tuple[float, float]

# Match floats in scientific notation produced by Python's json.dumps for very
# small values (e.g. "1e-06"). We convert them to plain decimal so that JSON
# output is byte-identical to the JavaScript implementation (SPEC §10).
_SCIENTIFIC_RE = re.compile(r"\b(-?)(\d+(?:\.\d+)?)e([+-])(\d+)\b")


def _expand_scientific(match: re.Match[str]) -> str:
    sign, mantissa, exp_sign, exp_digits = match.groups()
    exp = int(exp_digits)
    # Split mantissa into integer/fraction
    if "." in mantissa:
        int_part, frac_part = mantissa.split(".")
    else:
        int_part, frac_part = mantissa, ""
    digits = int_part + frac_part
    if exp_sign == "-":
        # shift decimal point left by exp
        zeros = exp - len(int_part)
        if zeros >= 0:
            out = "0." + "0" * zeros + digits.lstrip("0") or "0"
            if out.endswith("."):
                out += "0"
        else:
            split = len(int_part) - exp
            out = digits[:split] + "." + digits[split:]
    else:
        # shift decimal point right by exp
        zeros = exp - len(frac_part)
        if zeros >= 0:
            out = digits + "0" * zeros
        else:
            split = len(digits) + zeros
            out = digits[:split] + "." + digits[split:]
    return sign + out


def _decimalize(s: str) -> str:
    """Post-process json output to remove scientific notation for parity."""
    return _SCIENTIFIC_RE.sub(_expand_scientific, s)


def _round_points(pts: list[Point], decimals: int = 6) -> list[list[float]]:
    return [[round(x, decimals), round(y, decimals)] for x, y in pts]


def to_json(
    *,
    src: str,
    width: int,
    height: int,
    pad: int,
    max_points: int,
    points: list[Point],
    indent: int | None = 2,
) -> str:
    """Canonical JSON. 6-decimal points, sorted keys, no BOM. Parity surface."""
    payload: dict[str, Any] = {
        "src": src,
        "raster": {"width": int(width), "height": int(height), "pad": int(pad)},
        "max_points": int(max_points),
        "n_points": len(points),
        "points": _round_points(points),
    }
    return _decimalize(json.dumps(payload, indent=indent, sort_keys=True, ensure_ascii=False))


def to_css(points: list[Point], *, selector: str | None = None) -> str:
    """CSS polygon. 2-decimal percentages. Parity surface."""
    coords = ", ".join(f"{x * 100:.2f}% {y * 100:.2f}%" for x, y in points)
    polygon = f"polygon({coords})"
    if not selector:
        return polygon + ";\n"
    return (
        f"{selector} {{\n"
        f"  shape-outside: {polygon};\n"
        f"  clip-path: {polygon};\n"
        f"}}\n"
    )


def to_svg(points: list[Point], *, width: int, height: int) -> str:
    """SVG with one <polygon>, dimensioned to (width, height) px."""
    coords = " ".join(f"{x * width:.2f},{y * height:.2f}" for x, y in points)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" '
        f'width="{width}" height="{height}">\n'
        f'  <polygon points="{coords}" fill="#000000" fill-opacity="0.35" '
        f'stroke="#000000" stroke-width="1"/>\n'
        f"</svg>\n"
    )


def to_png(points: list[Point], *, width: int, height: int) -> bytes:
    """Rasterized SVG polygon overlay."""
    import resvg_py

    svg = to_svg(points, width=width, height=height)
    return bytes(resvg_py.svg_to_bytes(svg_string=svg, width=width, height=height))


def to_html(
    *,
    points: list[Point],
    width: int,
    height: int,
    src: str | None = None,
    src_data_url: str | None = None,
) -> str:
    """Self-contained HTML overlaying the polygon on top of the source.

    Pass `src_data_url` for inline image, or `src` for an external URL.
    """
    coords_pct = ", ".join(f"{x * 100:.2f}% {y * 100:.2f}%" for x, y in points)
    coords_xy = " ".join(f"{x * width:.2f},{y * height:.2f}" for x, y in points)
    img_src = src_data_url or src or ""
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>ipolypad preview</title>
  <style>
    body {{ font-family: -apple-system, system-ui, sans-serif; padding: 24px; background: #f6f7f9; }}
    .stage {{ position: relative; width: {width}px; height: {height}px; }}
    .stage img {{ position: absolute; inset: 0; width: 100%; height: 100%; }}
    .stage svg {{ position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }}
    code {{ display: block; white-space: pre-wrap; background: #fff; padding: 12px; border: 1px solid #e2e6ec; border-radius: 6px; }}
  </style>
</head>
<body>
  <h1>ipolypad preview</h1>
  <div class="stage">
    {'<img src="' + img_src + '" alt="source">' if img_src else ''}
    <svg viewBox="0 0 {width} {height}"><polygon points="{coords_xy}" fill="rgba(255, 64, 64, 0.35)" stroke="rgba(255, 64, 64, 0.9)" stroke-width="1.5"/></svg>
  </div>
  <h2>CSS</h2>
  <code>shape-outside: polygon({coords_pct});</code>
</body>
</html>
"""


# convenience for callers that hold a polygon plus the canonical metadata
def emit(
    fmt: str,
    *,
    points: list[Point],
    src: str,
    width: int,
    height: int,
    pad: int,
    max_points: int,
    selector: str | None = None,
) -> str | bytes:
    fmt = fmt.lower()
    if fmt == "json":
        return to_json(
            src=src,
            width=width,
            height=height,
            pad=pad,
            max_points=max_points,
            points=points,
        )
    if fmt == "css":
        return to_css(points, selector=selector)
    if fmt == "svg":
        return to_svg(points, width=width, height=height)
    if fmt == "png":
        return to_png(points, width=width, height=height)
    if fmt == "html":
        return to_html(points=points, width=width, height=height, src=src)
    raise ValueError(f"unsupported format: {fmt!r}")


# silence unused-import warning if rasterizer isn't loaded
_ = io
