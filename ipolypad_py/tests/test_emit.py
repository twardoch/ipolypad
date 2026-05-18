# this_file: ipolypad_py/tests/test_emit.py
"""Emitter format tests — deterministic, no I/O."""
from __future__ import annotations

import json

from ipolypad.emit import to_css, to_json, to_svg


def test_json_is_sorted_keys_and_six_decimals() -> None:
    s = to_json(
        src="x.svg",
        width=200,
        height=200,
        pad=6,
        max_points=8,
        points=[(0.12345678, 0.87654321)],
    )
    # sorted keys means "max_points" precedes "n_points" precedes "points"…
    parsed = json.loads(s)
    assert list(parsed.keys()) == sorted(parsed.keys())
    assert parsed["points"][0] == [0.123457, 0.876543]


def test_json_n_points_matches() -> None:
    pts = [(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)]
    s = to_json(src="x", width=100, height=100, pad=0, max_points=8, points=pts)
    parsed = json.loads(s)
    assert parsed["n_points"] == 4


def test_css_two_decimals() -> None:
    css = to_css([(0.5, 0.5)], selector=None)
    assert css.startswith("polygon(50.00% 50.00%);")


def test_css_with_selector() -> None:
    css = to_css([(0.0, 0.0), (1.0, 1.0)], selector=".figure")
    assert "shape-outside: polygon(0.00% 0.00%, 100.00% 100.00%);" in css
    assert "clip-path: polygon(0.00% 0.00%, 100.00% 100.00%);" in css


def test_svg_has_polygon_element() -> None:
    svg = to_svg([(0.0, 0.0), (1.0, 1.0)], width=100, height=100)
    assert '<svg xmlns="http://www.w3.org/2000/svg"' in svg
    assert '<polygon points="0.00,0.00 100.00,100.00"' in svg
