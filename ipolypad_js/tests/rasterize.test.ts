// this_file: ipolypad_js/tests/rasterize.test.ts
import { describe, expect, it } from 'vitest';
import { alphaFromRGBA, dilateCircular, erodeCircular, maskFixed, padMask, sanitizeSvg } from '../src/rasterize.js';

describe('sanitizeSvg', () => {
  it('strips sizing and style attributes from the root svg only', () => {
    const svg = '<svg width="10" height="20" style="transform: scale(-1,1)" viewBox="0 0 10 20"><g style="fill:red"/></svg>';
    expect(sanitizeSvg(svg)).toBe('<svg viewBox="0 0 10 20"><g style="fill:red"/></svg>');
  });

  it('handles single-quoted and unquoted root attributes', () => {
    const svg = "<svg width='10' height=20 style='transform: scale(-1,1)' viewBox='0 0 10 20'><path/></svg>";
    expect(sanitizeSvg(svg)).toBe("<svg viewBox='0 0 10 20'><path/></svg>");
  });
});

describe('alphaFromRGBA', () => {
  it('extracts the alpha channel', () => {
    const rgba = new Uint8ClampedArray([
      255, 0, 0, 25,  0, 255, 0, 200,  0, 0, 255, 0,  0, 0, 0, 255,
    ]);
    const a = alphaFromRGBA(rgba, 2, 2);
    expect(Array.from(a)).toEqual([25, 200, 0, 255]);
  });
});

describe('maskFixed', () => {
  it('threshold = 24, strict greater', () => {
    const a = new Uint8Array([0, 24, 25, 255]);
    expect(Array.from(maskFixed(a, 24))).toEqual([0, 0, 1, 1]);
  });
});

describe('dilateCircular', () => {
  it('radius 0 is identity', () => {
    const m = new Uint8Array([0, 1, 0, 0]);
    const out = dilateCircular(m, 2, 2, 0);
    expect(Array.from(out)).toEqual([0, 1, 0, 0]);
  });
  it('radius 1 grows a single foreground pixel into a plus', () => {
    // 5x5 with centre foreground
    const m = new Uint8Array(25);
    m[12] = 1;
    const out = dilateCircular(m, 5, 5, 1);
    // r=1 disc → 5 cells (plus sign). At (2,2), neighbours are (1,2),(3,2),(2,1),(2,3),(2,2).
    const on = Array.from(out).map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
    expect(on.sort((a, b) => a - b)).toEqual([7, 11, 12, 13, 17]);
  });
});

describe('erodeCircular', () => {
  it('radius 1 shrinks a filled block by one plus-neighbour radius', () => {
    const m = new Uint8Array(25).fill(1);
    const out = erodeCircular(m, 5, 5, 1);
    expect(Array.from(out)).toEqual([
      0, 0, 0, 0, 0,
      0, 1, 1, 1, 0,
      0, 1, 1, 1, 0,
      0, 1, 1, 1, 0,
      0, 0, 0, 0, 0,
    ]);
  });
});

describe('padMask', () => {
  it('adds transparent room around the source mask', () => {
    const m = new Uint8Array([1, 0, 0, 1]);
    const out = padMask(m, 2, 2, 1);
    expect(out.width).toBe(4);
    expect(out.height).toBe(4);
    expect(Array.from(out.mask)).toEqual([
      0, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 0,
    ]);
  });
  it('does not offset the source mask for negative padding', () => {
    const m = new Uint8Array([1, 0, 0, 1]);
    const out = padMask(m, 2, 2, -1);
    expect(out.width).toBe(2);
    expect(out.height).toBe(2);
    expect(Array.from(out.mask)).toEqual([1, 0, 0, 1]);
  });
});
