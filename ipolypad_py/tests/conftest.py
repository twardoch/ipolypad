# this_file: ipolypad_py/tests/conftest.py
from __future__ import annotations

from pathlib import Path

import pytest

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture(scope="session")
def fixtures_dir() -> Path:
    return FIXTURES


@pytest.fixture(scope="session")
def sample_svg(fixtures_dir: Path) -> Path:
    p = fixtures_dir / "circle.svg"
    if not p.exists():
        p.write_text(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'
            '<circle cx="50" cy="50" r="40" fill="black"/></svg>'
        )
    return p


@pytest.fixture(scope="session")
def sample_svg_star(fixtures_dir: Path) -> Path:
    p = fixtures_dir / "star.svg"
    if not p.exists():
        # Five-pointed star
        p.write_text(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'
            '<polygon points="50,5 61,38 95,38 67,57 79,90 50,69 21,90 33,57 5,38 39,38" '
            'fill="black"/></svg>'
        )
    return p
