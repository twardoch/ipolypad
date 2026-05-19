"""Top-level pipeline. SPEC §2."""
# this_file: ipolypad_py/src/ipolypad/pipeline.py
from __future__ import annotations

from pathlib import Path
from typing import Any, Literal

import numpy as np

from .color import autoenhance, mask_fixed, mask_smart
from .emit import emit
from .errors import EmptyMaskError, OnlyFrameError, TraceEmptyError
from .fetch import fetch, is_svg
from .rasterize import (
    alpha_array,
    apply_svg_root_transform,
    detect_svg_root_transform,
    rasterize,
)
from .simplify import convex_hull, decimate, normalize, pick_outer_shell, polygon_area
from .trace import dilate_circular, erode_circular, trace_mask

Format = Literal["json", "css", "svg", "png", "html"]


def _resolve_pad(*, pad: int | None, pad_pct: float | None, size: int) -> int:
    if pad is not None and pad_pct is not None:
        raise ValueError("pass either pad or pad_pct, not both")
    if pad_pct is not None:
        return round(pad_pct / 100.0 * size)
    if pad is None:
        return 6
    return int(pad)


def trace(
    src: str,
    *,
    size: int = 200,
    margin: int = 20,
    pad: int | None = None,
    pad_pct: float | None = None,
    max_points: int = 32,
    samples_per_curve: int = 4,
    hull: bool = True,
    enhance: bool | None = None,
    bg_tolerance: float = 12.0,
    smart_mask: bool = True,
    format: Format = "json",
    selector: str | None = None,
    out: str | None = None,
) -> dict[str, Any] | str | bytes:
    """Trace an image/SVG into a padded polygon hull.

    See SPEC §2 for the pipeline and §6 for option defaults.

    Returns the decoded JSON payload (dict) when ``format='json'`` and no
    ``out`` path is given; otherwise returns the formatted string/bytes.
    """
    pad_px = _resolve_pad(pad=pad, pad_pct=pad_pct, size=size)
    data = fetch(src)
    svg_flag = is_svg(src, data)
    svg_root_transform = (
        detect_svg_root_transform(data.decode("utf-8"))
        if svg_flag
        else (False, False)
    )

    if enhance is None:
        enhance = not svg_flag

    img = rasterize(data, size=size, margin=margin, is_svg=svg_flag)
    if enhance:
        img = autoenhance(img)

    if smart_mask:
        mask = mask_smart(img, bg_tolerance=bg_tolerance)
    else:
        mask = mask_fixed(img, threshold=24)

    if not mask.any():
        raise EmptyMaskError(
            "no foreground above threshold; lower --bg-tolerance or check source"
        )

    h, w = mask.shape
    offset = pad_px if pad_px > 0 else 0
    work_mask = (
        np.pad(mask, ((offset, offset), (offset, offset)), constant_values=False)
        if pad_px > 0
        else mask
    )
    work_mask = (
        erode_circular(work_mask, radius=abs(pad_px))
        if pad_px < 0
        else dilate_circular(work_mask, radius=pad_px)
    )
    if not work_mask.any():
        raise EmptyMaskError("padding eroded the foreground to empty")
    work_h, work_w = work_mask.shape
    polygons = trace_mask(work_mask, samples_per_curve=samples_per_curve)
    if not polygons:
        raise TraceEmptyError("potrace produced no curves")

    canvas_area = float(work_h * work_w)
    best = pick_outer_shell(polygons, canvas_area=canvas_area)
    if best is None:
        raise OnlyFrameError("only the bitmap-frame curve was traced")

    pts = convex_hull(best) if hull else best
    pts = decimate(pts, max_points)
    pts = normalize(pts, w, h, offset_x=offset, offset_y=offset)
    pts = apply_svg_root_transform(pts, svg_root_transform)

    if format == "json":
        payload_str = emit(
            "json",
            points=pts,
            src=src,
            width=w,
            height=h,
            pad=pad_px,
            max_points=max_points,
        )
        if out:
            Path(out).write_text(payload_str)  # type: ignore[arg-type]
        # Return parsed dict for ergonomic library use.
        import json as _json

        return _json.loads(payload_str)  # type: ignore[arg-type]

    if format == "css":
        css = emit(
            "css",
            points=pts,
            src=src,
            width=w,
            height=h,
            pad=pad_px,
            max_points=max_points,
            selector=selector,
        )
        if out:
            Path(out).write_text(css)  # type: ignore[arg-type]
        return css

    if format == "svg":
        svg = emit(
            "svg",
            points=pts,
            src=src,
            width=w,
            height=h,
            pad=pad_px,
            max_points=max_points,
        )
        if out:
            Path(out).write_text(svg)  # type: ignore[arg-type]
        return svg

    if format == "png":
        png = emit(
            "png",
            points=pts,
            src=src,
            width=w,
            height=h,
            pad=pad_px,
            max_points=max_points,
        )
        if out:
            Path(out).write_bytes(png)  # type: ignore[arg-type]
        return png

    if format == "html":
        html = emit(
            "html",
            points=pts,
            src=src,
            width=w,
            height=h,
            pad=pad_px,
            max_points=max_points,
        )
        if out:
            Path(out).write_text(html)  # type: ignore[arg-type]
        return html

    raise ValueError(f"unsupported format: {format!r}")


# Re-export for clarity; consumed by __main__.py
_ = (alpha_array, polygon_area)
