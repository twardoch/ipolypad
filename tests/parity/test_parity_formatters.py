# this_file: tests/parity/test_parity_formatters.py
"""Cross-language formatter byte-parity. SPEC §10."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).parent.parent.parent
FIXTURES = Path(__file__).parent / "fixtures"
JS_PKG = ROOT / "ipolypad_js"


@pytest.fixture(scope="module")
def cases() -> dict[str, dict]:
    return json.loads((FIXTURES / "polygons.json").read_text())


def py_json(case: dict) -> str:
    from ipolypad.emit import to_json

    pts = [tuple(p) for p in case["points"]]
    return to_json(
        src=case["src"],
        width=case["width"],
        height=case["height"],
        pad=case["pad"],
        max_points=case["max_points"],
        points=pts,
    )


def py_css(case: dict) -> str:
    from ipolypad.emit import to_css

    pts = [tuple(p) for p in case["points"]]
    return to_css(pts, selector=".figure")


def js_render(case: dict, fmt: str) -> str:
    """Invoke node to call the JS formatter and return stdout."""
    script = JS_PKG / "tests" / "_render.mjs"
    payload = json.dumps({"case": case, "fmt": fmt})
    proc = subprocess.run(
        ["node", str(script)],
        input=payload,
        capture_output=True,
        text=True,
        timeout=15,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"JS render failed: {proc.stderr}")
    return proc.stdout


def has_node() -> bool:
    try:
        return subprocess.run(["node", "--version"], capture_output=True, check=False).returncode == 0
    except FileNotFoundError:
        return False


@pytest.mark.skipif(not has_node(), reason="node not available")
@pytest.mark.parametrize("name", ["square", "asymmetric"])
def test_json_byte_parity(name: str, cases: dict) -> None:
    case = cases[name]
    py = py_json(case)
    js = js_render(case, "json")
    assert py == js, f"JSON differs for case {name!r}:\n--- py\n{py}\n--- js\n{js}"


@pytest.mark.skipif(not has_node(), reason="node not available")
@pytest.mark.parametrize("name", ["square", "asymmetric"])
def test_css_byte_parity(name: str, cases: dict) -> None:
    case = cases[name]
    py = py_css(case)
    js = js_render(case, "css")
    assert py == js, f"CSS differs for case {name!r}:\n--- py\n{py}\n--- js\n{js}"


# Allow running this file directly via sys.executable -m pytest
if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-v"]))
