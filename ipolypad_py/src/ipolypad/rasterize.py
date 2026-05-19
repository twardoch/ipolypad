"""Rasterize SVG/raster input to an alpha mask. SPEC §2.2."""
# this_file: ipolypad_py/src/ipolypad/rasterize.py
from __future__ import annotations

import io
import re

import numpy as np
import resvg_py
from PIL import Image

_RESAMPLE = getattr(Image, "Resampling", Image).LANCZOS


def _strip_root_attrs(svg_str: str) -> str:
    """Strip width/height/style from the root <svg>. Load-bearing for Qt SVGs."""
    return re.sub(
        r"<svg\b[^>]*>",
        lambda match: re.sub(
            r"""\s+(?:width|height|style)=(?:"[^"]*"|'[^']*'|[^\s>]+)""",
            "",
            match.group(0),
            flags=re.IGNORECASE,
        ),
        svg_str,
        count=1,
        flags=re.IGNORECASE,
    )


def rasterize(data: bytes, *, size: int, margin: int, is_svg: bool) -> Image.Image:
    """Render to RGBA size×size canvas with `margin`-px transparent gutter.

    Returns the centered RGBA composite. Use ``.split()[-1]`` for alpha.
    Raster inputs are scaled to fit ``inner × inner`` preserving aspect.
    """
    inner = max(8, size - 2 * margin)
    if is_svg:
        svg_str = _strip_root_attrs(data.decode("utf-8"))
        png_bytes = bytes(
            resvg_py.svg_to_bytes(svg_string=svg_str, width=inner, height=inner)
        )
        inner_img = Image.open(io.BytesIO(png_bytes)).convert("RGBA")
    else:
        inner_img = Image.open(io.BytesIO(data)).convert("RGBA")
        inner_img.thumbnail((inner, inner), _RESAMPLE)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    off = ((size - inner_img.width) // 2, (size - inner_img.height) // 2)
    canvas.paste(inner_img, off, inner_img)
    return canvas


def alpha_array(img: Image.Image) -> np.ndarray:
    """Alpha channel as uint8 H×W."""
    return np.array(img.split()[-1], dtype=np.uint8)
