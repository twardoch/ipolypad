"""ipolypad — image/SVG to padded polygon hull. See SPEC.md."""
# this_file: ipolypad_py/src/ipolypad/__init__.py
from __future__ import annotations

from .errors import (
    EmptyMaskError,
    FormatError,
    IpolypadError,
    OnlyFrameError,
    SourceError,
    TraceEmptyError,
)
from .pipeline import trace

try:
    from .__version__ import __version__
except ImportError:
    __version__ = "0.0.0+unknown"

__all__ = [
    "EmptyMaskError",
    "FormatError",
    "IpolypadError",
    "OnlyFrameError",
    "SourceError",
    "TraceEmptyError",
    "__version__",
    "trace",
]
