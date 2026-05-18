# this_file: ipolypad_py/tests/test_simplify.py
"""Pure geometry unit tests — no I/O, deterministic."""
from __future__ import annotations

import math

from ipolypad.simplify import (
    convex_hull,
    decimate,
    normalize,
    polygon_area,
    rdp,
)


def test_polygon_area_square() -> None:
    assert polygon_area([(0, 0), (10, 0), (10, 10), (0, 10)]) == 100.0


def test_polygon_area_orientation_independent() -> None:
    ccw = [(0, 0), (10, 0), (10, 10), (0, 10)]
    cw = list(reversed(ccw))
    assert polygon_area(ccw) == polygon_area(cw)


def test_convex_hull_of_grid_returns_corners_only() -> None:
    grid = [(x, y) for x in range(3) for y in range(3)]
    hull = convex_hull(grid)
    assert set(hull) == {(0, 0), (2, 0), (2, 2), (0, 2)}


def test_convex_hull_collinear_points_collapse() -> None:
    pts = [(0, 0), (1, 0), (2, 0), (2, 1), (2, 2), (0, 2)]
    hull = convex_hull(pts)
    # interior collinear points must drop
    assert (1, 0) not in hull


def test_rdp_keeps_endpoints() -> None:
    pts = [(0, 0), (1, 0.001), (2, 0.0), (3, 0.0), (4, 0)]
    out = rdp(pts, eps=0.1)
    assert out[0] == (0, 0)
    assert out[-1] == (4, 0)


def test_decimate_hits_target() -> None:
    # A 200-point noisy circle, decimate to 16
    pts = [
        (50 + 40 * math.cos(2 * math.pi * i / 200), 50 + 40 * math.sin(2 * math.pi * i / 200))
        for i in range(200)
    ]
    out = decimate(pts, 16)
    assert len(out) <= 16
    # not catastrophic shrinkage
    assert len(out) >= 8


def test_decimate_strips_closing_duplicate() -> None:
    # Without stripping the closing duplicate, RDP collapses to nothing.
    pts = [(0, 0), (10, 0), (10, 10), (0, 10), (0, 0)]
    out = decimate(pts, 4)
    assert len(out) == 4


def test_normalize_uses_canvas_box_not_bbox() -> None:
    # Points sitting in the centre quarter should not blow up to corners.
    pts = [(50, 50), (60, 50), (60, 60), (50, 60)]
    out = normalize(pts, 100, 100)
    assert out == [(0.5, 0.5), (0.6, 0.5), (0.6, 0.6), (0.5, 0.6)]
