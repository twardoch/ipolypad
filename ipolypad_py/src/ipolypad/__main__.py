"""Fire CLI. SPEC §7."""
# this_file: ipolypad_py/src/ipolypad/__main__.py
from __future__ import annotations

import json as _json
import sys
from concurrent.futures import ProcessPoolExecutor, as_completed
from glob import glob
from pathlib import Path
from typing import Any

import fire

from .errors import IpolypadError
from .pipeline import trace as _trace

_FORMAT_EXT = {"json": "json", "css": "css", "svg": "svg", "png": "png", "html": "html"}


def _formats(format: str) -> list[str]:
    return [f.strip().lower() for f in format.split(",") if f.strip()]


def _write_one(fmt: str, content: str | bytes | dict, out_path: Path) -> None:
    if fmt == "json":
        text = _json.dumps(content, indent=2, sort_keys=True, ensure_ascii=False) if isinstance(content, dict) else content
        out_path.write_text(text)  # type: ignore[arg-type]
    elif fmt == "png":
        out_path.write_bytes(content)  # type: ignore[arg-type]
    else:
        out_path.write_text(content)  # type: ignore[arg-type]


def trace(
    src: str,
    *,
    size: int = 200,
    margin: int = 20,
    pad: int | None = None,
    pad_pct: float | None = None,
    max_points: int = 32,
    samples_per_curve: int = 4,
    hull: bool = True,
    enhance: bool | None = None,
    bg_tolerance: float = 12.0,
    smart_mask: bool = True,
    format: str = "json",
    selector: str | None = None,
    out: str | None = None,
) -> Any:
    """Trace one source into one or more output formats.

    `format` may be a single name or a comma-separated list (e.g. `json,css,svg`).
    When multiple formats are requested with `--out`, `out` is treated as a base
    path: ``out.json``, ``out.css``, …
    """
    fmts = _formats(format)
    multi = len(fmts) > 1
    results: dict[str, Any] = {}
    for fmt in fmts:
        if fmt not in _FORMAT_EXT:
            sys.stderr.write(f"unknown format: {fmt}\n")
            sys.exit(2)
        try:
            result = _trace(
                src,
                size=size,
                margin=margin,
                pad=pad,
                pad_pct=pad_pct,
                max_points=max_points,
                samples_per_curve=samples_per_curve,
                hull=hull,
                enhance=enhance,
                bg_tolerance=bg_tolerance,
                smart_mask=smart_mask,
                format=fmt,  # type: ignore[arg-type]
                selector=selector,
                out=None,  # we'll write below
            )
        except IpolypadError as e:
            sys.stderr.write(f"error: {e}\n")
            sys.exit(3)
        results[fmt] = result
        if out:
            if multi:
                base = Path(out)
                target = base.with_suffix("." + _FORMAT_EXT[fmt])
            else:
                target = Path(out)
            _write_one(fmt, result, target)
    if multi:
        return {k: (v if not isinstance(v, bytes) else f"<{len(v)} bytes>") for k, v in results.items()}
    only = results[fmts[0]]
    return only


def _batch_one(args: tuple[str, str, dict[str, Any]]) -> tuple[str, str | None]:
    src, out_dir, opts = args
    try:
        fmts = _formats(opts.get("format", "json"))
        for fmt in fmts:
            opts_one = {**opts, "format": fmt}
            result = _trace(src, **opts_one)
            stem = Path(src).stem
            target = Path(out_dir) / f"{stem}.{_FORMAT_EXT[fmt]}"
            _write_one(fmt, result, target)
        return src, None
    except Exception as e:  # noqa: BLE001
        return src, str(e)


def batch(
    pattern: str,
    *,
    out_dir: str,
    size: int = 200,
    margin: int = 20,
    pad: int | None = None,
    pad_pct: float | None = None,
    max_points: int = 32,
    samples_per_curve: int = 4,
    hull: bool = True,
    enhance: bool | None = None,
    bg_tolerance: float = 12.0,
    smart_mask: bool = True,
    format: str = "json",
    selector: str | None = None,
    workers: int | None = None,
) -> None:
    """Process many sources in parallel.

    `pattern` is a glob (e.g. ``'assets/*.svg'``). Outputs land in ``out_dir/``
    with the same stem and the format extension.
    """
    paths = sorted(glob(pattern))
    if not paths:
        sys.stderr.write(f"no files match {pattern!r}\n")
        sys.exit(2)
    Path(out_dir).mkdir(parents=True, exist_ok=True)
    opts: dict[str, Any] = dict(
        size=size,
        margin=margin,
        pad=pad,
        pad_pct=pad_pct,
        max_points=max_points,
        samples_per_curve=samples_per_curve,
        hull=hull,
        enhance=enhance,
        bg_tolerance=bg_tolerance,
        smart_mask=smart_mask,
        format=format,
        selector=selector,
    )
    fail = 0
    with ProcessPoolExecutor(max_workers=workers) as ex:
        futs = [ex.submit(_batch_one, (p, out_dir, opts)) for p in paths]
        for fut in as_completed(futs):
            src, err = fut.result()
            if err:
                sys.stderr.write(f"FAIL {src}: {err}\n")
                fail += 1
            else:
                sys.stdout.write(f"OK   {src}\n")
    if fail:
        sys.exit(3)


def main() -> None:
    fire.Fire({"trace": trace, "batch": batch})


if __name__ == "__main__":
    main()
