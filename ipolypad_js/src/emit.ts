// this_file: ipolypad_js/src/emit.ts
// SPEC §3.

import type { JsonResult, Point } from './types.js';

function roundN(x: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(x * f) / f;
}

export function buildPayload(args: {
  src: string;
  width: number;
  height: number;
  pad: number;
  maxPoints: number;
  points: Point[];
}): JsonResult {
  return {
    max_points: args.maxPoints,
    n_points: args.points.length,
    points: args.points.map(([x, y]) => [roundN(x, 6), roundN(y, 6)] as Point),
    raster: { width: args.width, height: args.height, pad: args.pad },
    src: args.src,
  };
}

/** Canonical JSON. Sorted keys (already produced by object literal order above),
 *  6-decimal points, indent 2. SPEC §10. */
export function toJsonString(result: JsonResult): string {
  // JSON.stringify with no replacer and indent 2 — keys preserve insertion order,
  // and we constructed the object alphabetically.
  return JSON.stringify(sortKeys(result), null, 2);
}

function sortKeys<T>(value: T): T {
  if (Array.isArray(value)) return value.map(sortKeys) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value).sort()) {
      out[k] = sortKeys((value as Record<string, unknown>)[k]);
    }
    return out as T;
  }
  return value;
}

export function toCss(points: Point[], selector?: string): string {
  const coords = points.map(([x, y]) => `${(x * 100).toFixed(2)}% ${(y * 100).toFixed(2)}%`).join(', ');
  const polygon = `polygon(${coords})`;
  if (!selector) return `${polygon};\n`;
  return (
    `${selector} {\n` +
    `  shape-outside: ${polygon};\n` +
    `  clip-path: ${polygon};\n` +
    `}\n`
  );
}
