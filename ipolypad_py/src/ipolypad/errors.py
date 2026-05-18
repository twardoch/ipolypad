"""Typed errors. SPEC §8."""
# this_file: ipolypad_py/src/ipolypad/errors.py
from __future__ import annotations


class IpolypadError(Exception):
    """Base."""


class SourceError(IpolypadError):
    """Cannot fetch or read input source."""


class FormatError(IpolypadError):
    """Unsupported content type."""


class EmptyMaskError(IpolypadError):
    """No foreground pixels above the threshold."""


class TraceEmptyError(IpolypadError):
    """potrace returned zero curves."""


class OnlyFrameError(IpolypadError):
    """All curves are the bitmap-frame artifact (≥ 95% canvas)."""
