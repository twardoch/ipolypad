// this_file: ipolypad_js/tests/trace-parse.test.ts
import { describe, expect, it } from 'vitest';
import { parsePotraceSvg } from '../src/trace.js';

describe('parsePotraceSvg', () => {
  it('parses a simple absolute M-L-Z square', () => {
    const svg = '<svg><path d="M 10 10 L 20 10 L 20 20 L 10 20 Z"/></svg>';
    const polys = parsePotraceSvg(svg, 4);
    expect(polys.length).toBe(1);
    expect(polys[0]).toEqual([[10, 10], [20, 10], [20, 20], [10, 20]]);
  });

  it('flattens a cubic bezier into samplesPerCurve segments', () => {
    // M 0 0 C 0 10 10 10 10 0  → bezier from (0,0) to (10,0)
    const svg = '<svg><path d="M 0 0 C 0 10 10 10 10 0 Z"/></svg>';
    const polys = parsePotraceSvg(svg, 4);
    expect(polys.length).toBe(1);
    // start + 4 samples = 5 points
    expect(polys[0]!.length).toBe(5);
    expect(polys[0]![0]).toEqual([0, 0]);
    expect(polys[0]![4]).toEqual([10, 0]);
  });

  it('handles multiple subpaths via repeated M', () => {
    const svg = '<svg><path d="M 0 0 L 1 0 L 1 1 Z M 5 5 L 6 5 L 6 6 Z"/></svg>';
    const polys = parsePotraceSvg(svg, 4);
    expect(polys.length).toBe(2);
  });

  it('parses relative commands', () => {
    const svg = '<svg><path d="m 10 10 l 10 0 l 0 10 l -10 0 z"/></svg>';
    const polys = parsePotraceSvg(svg, 4);
    expect(polys[0]).toEqual([[10, 10], [20, 10], [20, 20], [10, 20]]);
  });

  it('ignores empty d', () => {
    expect(parsePotraceSvg('<svg></svg>', 4)).toEqual([]);
  });

  it('applies the group transform emitted by esm-potrace-wasm', () => {
    const svg = [
      '<svg width="20" height="20" viewBox="0 0 20 20">',
      '<g transform="translate(0.000000,20.000000) scale(0.100000,-0.100000)">',
      '<path d="M50 100 l0 -50 50 0 50 0 0 50 0 50 -50 0 -50 0 0 -50z"/>',
      '</g></svg>',
    ].join('');
    const polys = parsePotraceSvg(svg, 4);
    expect(polys[0]).toEqual([[5, 10], [5, 15], [10, 15], [15, 15], [15, 10], [15, 5], [10, 5], [5, 5], [5, 10]]);
  });
});
