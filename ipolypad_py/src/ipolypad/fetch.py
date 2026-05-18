"""Fetch + content-type sniffing. SPEC §1, §2.1."""
# this_file: ipolypad_py/src/ipolypad/fetch.py
from __future__ import annotations

import base64
import binascii
import urllib.error
import urllib.request
from pathlib import Path

from .errors import SourceError


def fetch(src: str) -> bytes:
    """Resolve a source to bytes. Local path, http(s)://, or data: URL."""
    if src.startswith(("http://", "https://")):
        try:
            with urllib.request.urlopen(src, timeout=30) as r:  # noqa: S310
                return r.read()
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as e:
            raise SourceError(f"failed to fetch {src!r}: {e}") from e
    if src.startswith("data:"):
        try:
            header, payload = src.split(",", 1)
            if ";base64" in header:
                return base64.b64decode(payload)
            return payload.encode("utf-8")
        except (ValueError, binascii.Error) as e:
            raise SourceError(f"malformed data: URL: {e}") from e
    p = Path(src)
    if not p.exists():
        raise SourceError(f"file not found: {src!r}")
    try:
        return p.read_bytes()
    except OSError as e:
        raise SourceError(f"failed to read {src!r}: {e}") from e


def is_svg(src: str, data: bytes) -> bool:
    """Content-based first, extension fallback."""
    head = data[:512].lstrip()
    if head.startswith(b"<?xml") or head.startswith(b"<svg") or head.startswith(b"<!--"):
        return True
    if src.lower().endswith(".svg"):
        return True
    return False
