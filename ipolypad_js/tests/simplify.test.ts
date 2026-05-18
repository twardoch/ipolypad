// this_file: ipolypad_js/tests/simplify.test.ts
import { describe, expect, it } from 'vitest';
import {
  convexHull,
  decimate,
  normalize,
  polygonArea,
  rdp,
} from '../src/simplify.js';
import type { Point } from '../src/types.js';

describe('polygonArea', () => {
  it('square is 100', () => {
    expect(polygonArea([[0, 0], [10, 0], [10, 10], [0, 10]])).toBe(100);
  });
  it('orientation-independent', () => {
    const ccw: Point[] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    const cw = ccw.slice().reverse();
    expect(polygonArea(ccw)).toBe(polygonArea(cw));
  });
});

describe('convexHull', () => {
  it('3x3 grid → 4 corners', () => {
    const grid: Point[] = [];
    for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) grid.push([x, y]);
    const h = convexHull(grid);
    const got = new Set(h.map(([x, y]) => `${x},${y}`));
    expect(got).toEqual(new Set(['0,0', '2,0', '2,2', '0,2']));
  });
  it('drops interior collinear points', () => {
    const pts: Point[] = [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2], [0, 2]];
    const h = convexHull(pts);
    expect(h.some(([x, y]) => x === 1 && y === 0)).toBe(false);
  });
});

describe('rdp', () => {
  it('keeps endpoints', () => {
    const pts: Point[] = [[0, 0], [1, 0.001], [2, 0], [3, 0], [4, 0]];
    const out = rdp(pts, 0.1);
    expect(out[0]).toEqual([0, 0]);
    expect(out[out.length - 1]).toEqual([4, 0]);
  });
});

describe('decimate', () => {
  it('hits target on a noisy circle', () => {
    const pts: Point[] = [];
    for (let i = 0; i < 200; i++) {
      const t = (2 * Math.PI * i) / 200;
      pts.push([50 + 40 * Math.cos(t), 50 + 40 * Math.sin(t)]);
    }
    const out = decimate(pts, 16);
    expect(out.length).toBeLessThanOrEqual(16);
    expect(out.length).toBeGreaterThanOrEqual(8);
  });
  it('strips closing duplicate', () => {
    const pts: Point[] = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
    const out = decimate(pts, 4);
    expect(out.length).toBe(4);
  });
});

describe('normalize', () => {
  it('uses canvas dims, not bbox', () => {
    const pts: Point[] = [[50, 50], [60, 50], [60, 60], [50, 60]];
    const out = normalize(pts, 100, 100);
    expect(out).toEqual([[0.5, 0.5], [0.6, 0.5], [0.6, 0.6], [0.5, 0.6]]);
  });
});
