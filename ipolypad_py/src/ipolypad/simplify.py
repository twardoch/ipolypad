"""Polygon utilities: area, convex hull, RDP, vertex-count-targeted decimation. SPEC §2.6–§2.8."""
# this_file: ipolypad_py/src/ipolypad/simplify.py
from __future__ import annotations

import math

Point = tuple[float, float]


def polygon_area(pts: list[Point]) -> float:
    """Unsigned shoelace area."""
    a = 0.0
    n = len(pts)
    for i in range(n):
        x0, y0 = pts[i]
        x1, y1 = pts[(i + 1) % n]
        a += x0 * y1 - x1 * y0
    return abs(a) / 2.0


def pick_outer_shell(
    polygons: list[list[Point]], *, canvas_area: float, frame_fraction: float = 0.95
) -> list[Point] | None:
    """Largest non-frame curve. SPEC §2.6."""
    polygons = [p for p in polygons if polygon_area(p) < frame_fraction * canvas_area]
    if not polygons:
        return None
    polygons.sort(key=polygon_area, reverse=True)
    return polygons[0]


def convex_hull(pts: list[Point]) -> list[Point]:
    """Andrew's monotone chain. CCW, no closing duplicate. SPEC §2.7."""
    sorted_pts = sorted(set(pts))
    if len(sorted_pts) <= 1:
        return sorted_pts

    def cross(o: Point, a: Point, b: Point) -> float:
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lower: list[Point] = []
    for p in sorted_pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    upper: list[Point] = []
    for p in reversed(sorted_pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    return lower[:-1] + upper[:-1]


def rdp(pts: list[Point], eps: float) -> list[Point]:
    """Iterative Ramer-Douglas-Peucker."""
    if len(pts) < 3:
        return pts[:]
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        s, e = stack.pop()
        if e - s < 2:
            continue
        x0, y0 = pts[s]
        x1, y1 = pts[e]
        dx, dy = x1 - x0, y1 - y0
        denom = math.hypot(dx, dy) or 1.0
        best_i, best_d = -1, -1.0
        for i in range(s + 1, e):
            x, y = pts[i]
            d = abs(dy * x - dx * y + x1 * y0 - y1 * x0) / denom
            if d > best_d:
                best_d, best_i = d, i
        if best_d > eps:
            keep[best_i] = True
            stack.append((s, best_i))
            stack.append((best_i, e))
    return [pts[i] for i, k in enumerate(keep) if k]


def decimate(pts: list[Point], max_points: int) -> list[Point]:
    """Hit a target vertex count by binary-searching RDP epsilon. SPEC §2.8."""
    if len(pts) >= 2 and pts[0] == pts[-1]:
        pts = pts[:-1]
    if len(pts) <= max_points:
        return pts
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    diag = math.hypot(max(xs) - min(xs), max(ys) - min(ys)) or 1.0
    lo, hi = 0.0, diag * 0.25
    for _ in range(24):
        mid = (lo + hi) / 2
        out = rdp(pts, mid)
        if len(out) > max_points:
            lo = mid
        else:
            hi = mid
    return rdp(pts, hi)


def normalize(
    pts: list[Point],
    width: int,
    height: int,
    *,
    offset_x: float = 0.0,
    offset_y: float = 0.0,
) -> list[Point]:
    """Normalize over the original image box, optionally undoing work-canvas offset."""
    return [((x - offset_x) / width, (y - offset_y) / height) for (x, y) in pts]
