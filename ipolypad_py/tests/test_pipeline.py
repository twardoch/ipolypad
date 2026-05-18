# this_file: ipolypad_py/tests/test_pipeline.py
"""End-to-end pipeline tests. Hits real potrace + resvg."""
from __future__ import annotations

from pathlib import Path

import pytest

from ipolypad import trace


def test_trace_circle_svg_yields_polygon(sample_svg: Path) -> None:
    result = trace(str(sample_svg), size=200, pad=4, max_points=24)
    assert isinstance(result, dict)
    assert result["raster"]["width"] == 200
    assert result["raster"]["height"] == 200
    assert 3 <= result["n_points"] <= 24
    for x, y in result["points"]:
        assert 0.0 <= x <= 1.0
        assert 0.0 <= y <= 1.0


def test_trace_emits_css(sample_svg: Path) -> None:
    css = trace(str(sample_svg), size=200, format="css", selector=".figure")
    assert isinstance(css, str)
    assert "shape-outside: polygon(" in css
    assert "clip-path: polygon(" in css


def test_trace_deterministic(sample_svg: Path) -> None:
    a = trace(str(sample_svg), size=200, pad=4, max_points=24)
    b = trace(str(sample_svg), size=200, pad=4, max_points=24)
    assert a == b


def test_trace_writes_out(tmp_path: Path, sample_svg: Path) -> None:
    out = tmp_path / "circle.json"
    trace(str(sample_svg), size=200, pad=4, max_points=24, out=str(out))
    assert out.exists()
    text = out.read_text()
    assert '"n_points"' in text


def test_trace_star(sample_svg_star: Path) -> None:
    # Star with hull=False should keep more concavity than hull=True
    no_hull = trace(str(sample_svg_star), size=200, pad=2, max_points=64, hull=False)
    with_hull = trace(str(sample_svg_star), size=200, pad=2, max_points=64, hull=True)
    assert no_hull["n_points"] >= with_hull["n_points"]


def test_large_pad_can_extend_beyond_original_image(sample_svg: Path) -> None:
    result = trace(str(sample_svg), size=200, margin=0, pad=30, max_points=24)
    xs = [x for x, _ in result["points"]]
    ys = [y for _, y in result["points"]]
    assert min(xs) < 0.0, "left padding should extend outside the image box"
    assert max(xs) > 1.0, "right padding should extend outside the image box"
    assert min(ys) < 0.0, "top padding should extend outside the image box"
    assert max(ys) > 1.0, "bottom padding should extend outside the image box"
    assert result["raster"]["width"] == 200
    assert result["raster"]["height"] == 200


def test_negative_pad_shrinks_polygon(sample_svg: Path) -> None:
    zero = trace(str(sample_svg), size=200, pad=0, max_points=24)
    negative = trace(str(sample_svg), size=200, pad=-8, max_points=24)
    zero_width = max(x for x, _ in zero["points"]) - min(x for x, _ in zero["points"])
    negative_width = max(x for x, _ in negative["points"]) - min(x for x, _ in negative["points"])
    assert negative_width < zero_width, "negative padding should erode the foreground"
    assert negative["raster"]["pad"] == -8


def test_invalid_format_raises(sample_svg: Path) -> None:
    with pytest.raises(ValueError):
        trace(str(sample_svg), format="bogus")  # type: ignore[arg-type]
