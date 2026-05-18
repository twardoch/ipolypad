// this_file: ipolypad_js/src/rasterize.ts
// SPEC §2.1–§2.4. Source → alpha mask. Browser-first; Node-compatible via 'canvas' package.

import { SourceError, type Source } from './types.js';

/** Resolve any accepted Source to either { svg: string } or { png: Uint8Array }. */
export async function resolveSource(input: Source): Promise<
  { kind: 'svg'; markup: string; src: string }
  | { kind: 'image'; data: Uint8Array; src: string }
  | { kind: 'svg-element'; element: SVGElement; src: string }
  | { kind: 'img-element'; element: HTMLImageElement; src: string }
> {
  if (typeof input === 'string') {
    return resolveString(input);
  }
  if (input instanceof Uint8Array) {
    return classifyBytes(input, '<Uint8Array>');
  }
  if (typeof Blob !== 'undefined' && input instanceof Blob) {
    const buf = new Uint8Array(await input.arrayBuffer());
    return classifyBytes(buf, '<Blob>');
  }
  if (typeof SVGElement !== 'undefined' && input instanceof SVGElement) {
    return { kind: 'svg-element', element: input, src: '<SVGElement>' };
  }
  if (typeof HTMLImageElement !== 'undefined' && input instanceof HTMLImageElement) {
    return { kind: 'img-element', element: input, src: input.src || '<HTMLImageElement>' };
  }
  throw new SourceError('unsupported source type');
}

async function resolveString(input: string): Promise<
  { kind: 'svg'; markup: string; src: string }
  | { kind: 'image'; data: Uint8Array; src: string }
> {
  // Plain SVG markup
  if (input.trimStart().startsWith('<')) {
    return { kind: 'svg', markup: input, src: '<inline-svg>' };
  }
  // data: URL
  if (input.startsWith('data:')) {
    const commaIdx = input.indexOf(',');
    if (commaIdx < 0) throw new SourceError('malformed data: URL');
    const header = input.slice(5, commaIdx);
    const payload = input.slice(commaIdx + 1);
    const isBase64 = /;base64/i.test(header);
    if (/^image\/svg\+xml/i.test(header)) {
      const markup = isBase64 ? atob(payload) : decodeURIComponent(payload);
      return { kind: 'svg', markup, src: input.slice(0, 64) + '…' };
    }
    const bytes = isBase64
      ? Uint8Array.from(atob(payload), (c) => c.charCodeAt(0))
      : new TextEncoder().encode(decodeURIComponent(payload));
    return { kind: 'image', data: bytes, src: input.slice(0, 64) + '…' };
  }
  // URL — fetch
  let resp: Response;
  try {
    resp = await fetch(input);
  } catch (e) {
    throw new SourceError(`fetch failed: ${(e as Error).message}`);
  }
  if (!resp.ok) throw new SourceError(`HTTP ${resp.status} for ${input}`);
  const ct = resp.headers.get('content-type') ?? '';
  if (/svg/i.test(ct) || /\.svg(\?|$)/i.test(input)) {
    const markup = await resp.text();
    return { kind: 'svg', markup, src: input };
  }
  const buf = new Uint8Array(await resp.arrayBuffer());
  return classifyBytes(buf, input);
}

function classifyBytes(
  data: Uint8Array,
  src: string,
):
  | { kind: 'svg'; markup: string; src: string }
  | { kind: 'image'; data: Uint8Array; src: string } {
  // Detect SVG by looking at the head.
  if (data.length > 0) {
    let i = 0;
    while (i < data.length && (data[i] === 0x20 || data[i] === 0x0a || data[i] === 0x0d || data[i] === 0x09)) i++;
    if (data[i] === 0x3c /* < */) {
      const head = new TextDecoder().decode(data.subarray(0, Math.min(512, data.length)));
      if (head.includes('<svg') || head.startsWith('<?xml') || head.startsWith('<!--')) {
        return { kind: 'svg', markup: new TextDecoder().decode(data), src };
      }
    }
  }
  return { kind: 'image', data, src };
}

/** Strip width/height/style from root <svg>. SPEC §2.2. */
export function sanitizeSvg(markup: string): string {
  let out = markup;
  out = out.replace(/(<svg\b[^>]*?)\s+width="[^"]*"/i, '$1');
  out = out.replace(/(<svg\b[^>]*?)\s+height="[^"]*"/i, '$1');
  out = out.replace(/(<svg\b[^>]*?)\s+style="[^"]*"/i, '$1');
  return out;
}

/** Pull alpha (uint8) from RGBA H×W pixels into a Uint8Array of length H*W. */
export function alphaFromRGBA(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let i = 0, j = 3; i < out.length; i++, j += 4) {
    out[i] = rgba[j] ?? 0;
  }
  return out;
}

/** Fixed-threshold binary mask (alpha > 24). SPEC §2.3. */
export function maskFixed(alpha: Uint8Array, threshold = 24): Uint8Array {
  const out = new Uint8Array(alpha.length);
  for (let i = 0; i < alpha.length; i++) {
    out[i] = (alpha[i]! > threshold) ? 1 : 0;
  }
  return out;
}

/** Circular binary dilation. SPEC §2.4. Mask is row-major H×W of 0/1. */
export function dilateCircular(mask: Uint8Array, w: number, h: number, radius: number): Uint8Array {
  if (radius <= 0) return mask;
  const r = radius;
  // Build circular structuring element offset list
  const offsets: Array<[number, number]> = [];
  const r2 = r * r;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy <= r2) offsets.push([dx, dy]);
    }
  }
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x] !== 1) continue;
      // Splat onto out
      for (const [dx, dy] of offsets) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
          out[ny * w + nx] = 1;
        }
      }
    }
  }
  return out;
}

/** Circular binary erosion. Mask is row-major H×W of 0/1. */
export function erodeCircular(mask: Uint8Array, w: number, h: number, radius: number): Uint8Array {
  if (radius <= 0) return mask;
  const r = radius;
  const offsets: Array<[number, number]> = [];
  const r2 = r * r;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy <= r2) offsets.push([dx, dy]);
    }
  }
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x] !== 1) continue;
      let keep = true;
      for (const [dx, dy] of offsets) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= w || ny < 0 || ny >= h || mask[ny * w + nx] !== 1) {
          keep = false;
          break;
        }
      }
      if (keep) out[y * w + x] = 1;
    }
  }
  return out;
}

export function padMask(
  mask: Uint8Array,
  w: number,
  h: number,
  pad: number,
): { mask: Uint8Array; width: number; height: number } {
  if (pad <= 0) return { mask, width: w, height: h };
  const width = w + 2 * pad;
  const height = h + 2 * pad;
  const out = new Uint8Array(width * height);
  for (let y = 0; y < h; y++) {
    out.set(mask.subarray(y * w, y * w + w), (y + pad) * width + pad);
  }
  return { mask: out, width, height };
}
