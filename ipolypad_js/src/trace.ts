// this_file: ipolypad_js/src/trace.ts
// SPEC §2.5. Mask → polygons via potrace (esm-potrace-wasm) + bezier flattening.

import type { Point } from './types.js';

type PotraceFn = (
  image: ImageData | { data: Uint8ClampedArray | Uint8Array; width: number; height: number },
  options?: Record<string, unknown>,
) => Promise<string>;

let _potraceFn: PotraceFn | null = null;

/** Pluggable potrace entry point. The default loads `esm-potrace-wasm` lazily. */
export function setPotrace(fn: PotraceFn | null): void {
  _potraceFn = fn;
}

async function getPotrace(): Promise<PotraceFn> {
  if (_potraceFn) return _potraceFn;
  const mod = await import('esm-potrace-wasm');
  const fn = (mod as { potrace?: PotraceFn; default?: PotraceFn }).potrace
    ?? (mod as { default?: PotraceFn }).default;
  if (!fn) throw new Error('esm-potrace-wasm did not export a callable potrace function');
  _potraceFn = fn as PotraceFn;
  return _potraceFn;
}

/** Convert a 0/1 binary mask (H*W uint8) to opaque-black RGBA ImageData. */
export function maskToImageData(mask: Uint8Array, w: number, h: number): ImageData {
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0, j = 0; i < mask.length; i++, j += 4) {
    if (mask[i]) {
      rgba[j] = 0; rgba[j + 1] = 0; rgba[j + 2] = 0; rgba[j + 3] = 255;
    } else {
      rgba[j] = 255; rgba[j + 1] = 255; rgba[j + 2] = 255; rgba[j + 3] = 255;
    }
  }
  if (typeof ImageData !== 'undefined') {
    return new ImageData(rgba, w, h);
  }
  // Node fallback shape — duck-typed.
  return { data: rgba, width: w, height: h, colorSpace: 'srgb' as const } as unknown as ImageData;
}

/** Tokenize an SVG path `d` string into commands with absolute numeric coords.
 *  potrace emits absolute commands (M, L, C, Z) with cubic beziers. */
interface Cmd { kind: 'M' | 'L' | 'C' | 'Z'; nums: number[] }

function tokenize(d: string): Cmd[] {
  const out: Cmd[] = [];
  // Split into tokens preserving command letters
  const re = /([MLCZmlcz])|(-?\d*\.?\d+(?:[eE][+-]?\d+)?)/g;
  const toks: Array<{ cmd?: string; num?: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(d)) !== null) {
    if (m[1]) toks.push({ cmd: m[1] });
    else if (m[2]) toks.push({ num: parseFloat(m[2]) });
  }
  let i = 0;
  let curX = 0, curY = 0;
  let startX = 0, startY = 0;
  while (i < toks.length) {
    const t = toks[i]!;
    if (!t.cmd) { i++; continue; }
    const c = t.cmd;
    i++;
    if (c === 'Z' || c === 'z') {
      out.push({ kind: 'Z', nums: [] });
      curX = startX; curY = startY;
      continue;
    }
    // Read numbers until next command
    const expect =
      c === 'M' || c === 'm' || c === 'L' || c === 'l' ? 2
      : c === 'C' || c === 'c' ? 6
      : 0;
    const relative = c === c.toLowerCase();
    let first = true;
    while (i < toks.length && toks[i]!.num !== undefined) {
      const ns: number[] = [];
      for (let k = 0; k < expect; k++) {
        if (i >= toks.length || toks[i]!.num === undefined) break;
        ns.push(toks[i]!.num!);
        i++;
      }
      if (ns.length !== expect) break;
      // Resolve relative
      let abs = ns.slice();
      if (relative) {
        for (let k = 0; k < abs.length; k += 2) {
          abs[k] = abs[k]! + curX;
          abs[k + 1] = abs[k + 1]! + curY;
        }
      }
      const upper = c.toUpperCase() as 'M' | 'L' | 'C';
      // M followed by more pairs implicitly becomes L for the trailing pairs.
      let kind: 'M' | 'L' | 'C' = upper;
      if (upper === 'M' && !first) kind = 'L';
      out.push({ kind, nums: abs });
      if (kind === 'M') { startX = abs[0]!; startY = abs[1]!; }
      curX = abs[abs.length - 2]!;
      curY = abs[abs.length - 1]!;
      first = false;
    }
  }
  return out;
}

function cubic(
  p0: Point, p1: Point, p2: Point, p3: Point, samplesPerCurve: number,
): Point[] {
  const out: Point[] = [];
  for (let i = 1; i <= samplesPerCurve; i++) {
    const t = i / samplesPerCurve;
    const u = 1 - t;
    const bx = u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0];
    const by = u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1];
    out.push([bx, by]);
  }
  return out;
}

/** Parse a potrace SVG into a list of polygons (one per subpath). Beziers
 *  flattened with `samplesPerCurve` samples. Matches the Python flattener. */
export function parsePotraceSvg(svg: string, samplesPerCurve: number): Point[][] {
  const polygons: Point[][] = [];
  const transform = parseGroupTransform(svg);
  const pathRe = /<path[^>]*\sd="([^"]+)"/g;
  let pathMatch: RegExpExecArray | null;
  while ((pathMatch = pathRe.exec(svg)) !== null) {
    const d = pathMatch[1]!;
    const cmds = tokenize(d);
    let cur: Point | null = null;
    let start: Point | null = null;
    let buf: Point[] = [];
    const flush = () => {
      if (buf.length >= 3) polygons.push(buf.map(transform));
      buf = [];
    };
    for (const cmd of cmds) {
      if (cmd.kind === 'M') {
        if (buf.length > 0) flush();
        const p: Point = [cmd.nums[0]!, cmd.nums[1]!];
        cur = p; start = p; buf.push(p);
      } else if (cmd.kind === 'L') {
        const p: Point = [cmd.nums[0]!, cmd.nums[1]!];
        if (cur) buf.push(p);
        cur = p;
      } else if (cmd.kind === 'C') {
        if (!cur) continue;
        const p1: Point = [cmd.nums[0]!, cmd.nums[1]!];
        const p2: Point = [cmd.nums[2]!, cmd.nums[3]!];
        const p3: Point = [cmd.nums[4]!, cmd.nums[5]!];
        buf.push(...cubic(cur, p1, p2, p3, samplesPerCurve));
        cur = p3;
      } else if (cmd.kind === 'Z') {
        if (start && cur && (cur[0] !== start[0] || cur[1] !== start[1])) {
          // close
        }
        flush();
        cur = start;
      }
    }
    if (buf.length > 0) flush();
  }
  return polygons;
}

function parseGroupTransform(svg: string): (point: Point) => Point {
  const match = svg.match(
    /<g[^>]*\btransform="translate\(\s*([-+]?\d*\.?\d+)\s*,\s*([-+]?\d*\.?\d+)\s*\)\s*scale\(\s*([-+]?\d*\.?\d+)\s*,\s*([-+]?\d*\.?\d+)\s*\)"/,
  );
  if (!match) return (point: Point) => point;
  const tx = parseFloat(match[1]!);
  const ty = parseFloat(match[2]!);
  const sx = parseFloat(match[3]!);
  const sy = parseFloat(match[4]!);
  return ([x, y]: Point) => [tx + x * sx, ty + y * sy];
}

/** End-to-end: binary mask → polygon list. */
export async function traceMask(
  mask: Uint8Array,
  w: number,
  h: number,
  samplesPerCurve: number,
): Promise<Point[][]> {
  const potrace = await getPotrace();
  const img = maskToImageData(mask, w, h);
  const svg = await potrace(img, {
    turdsize: 2,
    turnpolicy: 0,
    alphamax: 1.0,
    optcurve: true,
    extractcolors: false,
  });
  return parsePotraceSvg(svg, samplesPerCurve);
}
