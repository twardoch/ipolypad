# Parity tests

Verify byte-identical output between `ipolypad_py` and `ipolypad_js` on the
parity surface (SPEC §10).

Two layers:

1. **Formatter parity** (`test_parity_formatters.py`) — feeds fixed polygons
   into both implementations' `to_json` / `to_css` and asserts byte equality.
   This catches divergence in rounding, key ordering, or whitespace.

2. **End-to-end parity** (`test_parity_e2e.py`, opt-in via `RUN_E2E=1`) — runs
   the full pipeline on shared SVG fixtures and asserts equality. This depends
   on both potrace bindings (Python `potracer` vs WASM `esm-potrace-wasm`)
   producing matching output, which they should but is not contractually
   guaranteed across versions. Marked best-effort.

Run:

```bash
# from repo root, after both packages are installed
uv run --with pytest pytest tests/parity/
RUN_E2E=1 uv run --with pytest pytest tests/parity/
```
