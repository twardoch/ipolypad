"""Dilate, potrace, flatten curves. SPEC §2.4–§2.5."""
# this_file: ipolypad_py/src/ipolypad/trace.py
from __future__ import annotations

import numpy as np
from potrace import Bitmap
from scipy.ndimage import binary_dilation, binary_erosion


def dilate_circular(mask: np.ndarray, *, radius: int) -> np.ndarray:
    """Binary dilation with a circular (Euclidean) structuring element."""
    if radius <= 0:
        return mask
    r = radius
    y, x = np.ogrid[-r : r + 1, -r : r + 1]
    struct = (x * x + y * y) <= r * r
    return binary_dilation(mask, structure=struct)


def erode_circular(mask: np.ndarray, *, radius: int) -> np.ndarray:
    """Binary erosion with a circular (Euclidean) structuring element."""
    if radius <= 0:
        return mask
    r = radius
    y, x = np.ogrid[-r : r + 1, -r : r + 1]
    struct = (x * x + y * y) <= r * r
    return binary_erosion(mask, structure=struct)


def flatten_curve(curve, *, samples_per_curve: int) -> list[tuple[float, float]]:
    """potrace curve → polyline. Beziers are flattened at fixed sample count."""
    pts: list[tuple[float, float]] = []
    p0 = (curve.start_point.x, curve.start_point.y)
    pts.append(p0)
    cur = p0
    for seg in curve.segments:
        if seg.is_corner:
            pts.append((seg.c.x, seg.c.y))
            pts.append((seg.end_point.x, seg.end_point.y))
            cur = (seg.end_point.x, seg.end_point.y)
        else:
            c1 = (seg.c1.x, seg.c1.y)
            c2 = (seg.c2.x, seg.c2.y)
            end = (seg.end_point.x, seg.end_point.y)
            for i in range(1, samples_per_curve + 1):
                t = i / samples_per_curve
                u = 1 - t
                bx = (
                    u**3 * cur[0]
                    + 3 * u**2 * t * c1[0]
                    + 3 * u * t**2 * c2[0]
                    + t**3 * end[0]
                )
                by = (
                    u**3 * cur[1]
                    + 3 * u**2 * t * c1[1]
                    + 3 * u * t**2 * c2[1]
                    + t**3 * end[1]
                )
                pts.append((bx, by))
            cur = end
    return pts


def trace_mask(
    mask: np.ndarray, *, samples_per_curve: int
) -> list[list[tuple[float, float]]]:
    """Run potrace and flatten each curve to a polyline.

    Required potrace parameters (SPEC §2.5): turdsize=2, turnpolicy=0, alphamax=1.0.
    """
    bm = Bitmap(mask)
    plist = bm.trace(turdsize=2, turnpolicy=0, alphamax=1.0)
    polygons: list[list[tuple[float, float]]] = []
    for curve in plist:
        pts = flatten_curve(curve, samples_per_curve=samples_per_curve)
        if len(pts) >= 3:
            polygons.append(pts)
    return polygons
