// this_file: ipolypad_js/tests/emit.test.ts
import { describe, expect, it } from 'vitest';
import { buildPayload, toCss, toJsonString } from '../src/emit.js';

describe('buildPayload', () => {
  it('rounds points to 6 decimals', () => {
    const p = buildPayload({
      src: 'x.svg', width: 200, height: 200, pad: 6, maxPoints: 8,
      points: [[0.12345678, 0.87654321]],
    });
    expect(p.points[0]).toEqual([0.123457, 0.876543]);
    expect(p.n_points).toBe(1);
  });
});

describe('toJsonString', () => {
  it('produces sorted-keys JSON', () => {
    const p = buildPayload({
      src: 'x', width: 100, height: 100, pad: 0, maxPoints: 8, points: [[0, 0]],
    });
    const s = toJsonString(p);
    const lines = s.split('\n').map((l) => l.trimStart());
    // Top-level key order: max_points, n_points, points, raster, src
    expect(lines[1]?.startsWith('"max_points"')).toBe(true);
  });
});

describe('toCss', () => {
  it('two decimals, no selector', () => {
    expect(toCss([[0.5, 0.5]])).toBe('polygon(50.00% 50.00%);\n');
  });
  it('with selector emits shape-outside + clip-path', () => {
    const css = toCss([[0, 0], [1, 1]], '.figure');
    expect(css).toContain('shape-outside: polygon(0.00% 0.00%, 100.00% 100.00%);');
    expect(css).toContain('clip-path: polygon(0.00% 0.00%, 100.00% 100.00%);');
  });
});
