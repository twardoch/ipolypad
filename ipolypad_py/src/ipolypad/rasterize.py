"""Rasterize SVG/raster input to an alpha mask. SPEC §2.2."""
# this_file: ipolypad_py/src/ipolypad/rasterize.py
from __future__ import annotations

import io
import re

import numpy as np
import resvg_py
from PIL import Image

_RESAMPLE = getattr(Image, "Resampling", Image).LANCZOS
Point = tuple[float, float]
SvgRootTransform = tuple[bool, bool]


def _prepare_svg_for_raster(svg_str: str) -> str:
    """Neutralize root sizing/transform attrs for stable rasterization."""
    return re.sub(
        r"<svg\b[^>]*>",
        lambda match: re.sub(
            r"""\s+(?:width|height|style|transform)=(?:"[^"]*"|'[^']*'|[^\s>]+)""",
            "",
            match.group(0),
            flags=re.IGNORECASE,
        ),
        svg_str,
        count=1,
        flags=re.IGNORECASE,
    )


_strip_root_attrs = _prepare_svg_for_raster


def detect_svg_root_transform(svg_str: str) -> SvgRootTransform:
    """Detect root-level mirror transforms that should be applied to the hull."""
    root_match = re.search(r"<svg\b[^>]*>", svg_str, flags=re.IGNORECASE)
    root = root_match.group(0) if root_match else ""
    transform_parts: list[str] = []
    style = _read_root_attr(root, "style")
    if style:
        style_match = re.search(r"(?:^|;)\s*transform\s*:\s*([^;]+)", style, flags=re.IGNORECASE)
        if style_match:
            transform_parts.append(style_match.group(1))
    transform = _read_root_attr(root, "transform")
    if transform:
        transform_parts.append(transform)

    flip_x = False
    flip_y = False
    for part in transform_parts:
        part_flip_x, part_flip_y = _detect_flip(part)
        flip_x = flip_x != part_flip_x
        flip_y = flip_y != part_flip_y
    return flip_x, flip_y


def apply_svg_root_transform(
    points: list[Point], transform: SvgRootTransform
) -> list[Point]:
    """Apply detected SVG root mirror transforms to normalized output points."""
    flip_x, flip_y = transform
    if not flip_x and not flip_y:
        return points
    out = [
        (1.0 - x if flip_x else x, 1.0 - y if flip_y else y)
        for x, y in points
    ]
    return list(reversed(out)) if flip_x != flip_y else out


def _read_root_attr(root: str, name: str) -> str | None:
    match = re.search(
        rf"""\s{name}\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))""",
        root,
        flags=re.IGNORECASE,
    )
    if not match:
        return None
    return next((group for group in match.groups() if group is not None), "")


def _detect_flip(transform: str) -> SvgRootTransform:
    flip_x = False
    flip_y = False
    number = r"[-+]?(?:\d*\.\d+|\d+)(?:e[-+]?\d+)?"
    for match in re.finditer(rf"scaleX\(\s*({number})\s*\)", transform, flags=re.IGNORECASE):
        flip_x = flip_x != (float(match.group(1)) < 0)
    for match in re.finditer(rf"scaleY\(\s*({number})\s*\)", transform, flags=re.IGNORECASE):
        flip_y = flip_y != (float(match.group(1)) < 0)
    for match in re.finditer(
        rf"scale\(\s*({number})(?:[\s,]+({number}))?\s*\)",
        transform,
        flags=re.IGNORECASE,
    ):
        sx = float(match.group(1))
        sy = sx if match.group(2) is None else float(match.group(2))
        flip_x = flip_x != (sx < 0)
        flip_y = flip_y != (sy < 0)
    for match in re.finditer(
        rf"matrix\(\s*({number})[\s,]+{number}[\s,]+{number}[\s,]+({number})[\s,]+{number}[\s,]+{number}\s*\)",
        transform,
        flags=re.IGNORECASE,
    ):
        flip_x = flip_x != (float(match.group(1)) < 0)
        flip_y = flip_y != (float(match.group(2)) < 0)
    return flip_x, flip_y


def rasterize(data: bytes, *, size: int, margin: int, is_svg: bool) -> Image.Image:
    """Render to RGBA size×size canvas with `margin`-px transparent gutter.

    Returns the centered RGBA composite. Use ``.split()[-1]`` for alpha.
    Raster inputs are scaled to fit ``inner × inner`` preserving aspect.
    """
    inner = max(8, size - 2 * margin)
    if is_svg:
        svg_str = _prepare_svg_for_raster(data.decode("utf-8"))
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
