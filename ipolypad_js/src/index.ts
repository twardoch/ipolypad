// this_file: ipolypad_js/src/index.ts
// Public entry. SPEC §5.1.

import { buildPayload, toCss, toJsonString } from './emit.js';
import {
  rasterizeElement,
  rasterizeImageBytes,
  rasterizeSvg,
} from './canvas.js';
import { alphaFromRGBA, dilateCircular, maskFixed, padMask, resolveSource } from './rasterize.js';
import {
  convexHull,
  decimate,
  normalize,
  pickOuterShell,
} from './simplify.js';
import { traceMask } from './trace.js';
import {
  EmptyMaskError,
  IpolypadError,
  OnlyFrameError,
  SourceError,
  TraceEmptyError,
  type JsonResult,
  type Options,
  type Source,
} from './types.js';

export type { JsonResult, Options, Point, Source } from './types.js';
export {
  EmptyMaskError,
  FormatError,
  IpolypadError,
  OnlyFrameError,
  SourceError,
  TraceEmptyError,
} from './types.js';
export { setPotrace } from './trace.js';
export { setNodeCanvasFactory } from './canvas.js';
export { buildPayload, toCss, toJsonString } from './emit.js';
export {
  convexHull,
  decimate,
  normalize,
  pickOuterShell,
  polygonArea,
  rdp,
} from './simplify.js';

const DEFAULTS = {
  size: 200,
  margin: 20,
  pad: 6,
  maxPoints: 32,
  samplesPerCurve: 4,
  hull: true,
  format: 'json' as const,
};

/** Trace an image/SVG into a padded polygon hull. SPEC §5.1. */
export async function ipolypad(input: Source, options: Options = {}): Promise<JsonResult | string> {
  const size = options.size ?? DEFAULTS.size;
  const margin = options.margin ?? DEFAULTS.margin;
  const pad = options.pad ?? DEFAULTS.pad;
  const maxPoints = options.maxPoints ?? DEFAULTS.maxPoints;
  const samplesPerCurve = options.samplesPerCurve ?? DEFAULTS.samplesPerCurve;
  const hull = options.hull ?? DEFAULTS.hull;
  const format = options.format ?? DEFAULTS.format;

  const resolved = await resolveSource(input);

  let pixels;
  if (resolved.kind === 'svg') {
    pixels = await rasterizeSvg(resolved.markup, size, margin);
  } else if (resolved.kind === 'image') {
    pixels = await rasterizeImageBytes(resolved.data, size, margin);
  } else if (resolved.kind === 'svg-element' || resolved.kind === 'img-element') {
    pixels = await rasterizeElement(resolved.element, size, margin);
  } else {
    throw new SourceError('unsupported source kind');
  }

  const alpha = alphaFromRGBA(pixels.rgba, pixels.width, pixels.height);
  let mask = maskFixed(alpha, 24);

  let any = false;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i]) { any = true; break; }
  }
  if (!any) throw new EmptyMaskError('no foreground above alpha threshold (24)');

  const work = padMask(mask, pixels.width, pixels.height, pad);
  mask = dilateCircular(work.mask, work.width, work.height, pad);
  const polygons = await traceMask(mask, work.width, work.height, samplesPerCurve);
  if (polygons.length === 0) throw new TraceEmptyError('potrace produced no curves');

  const canvasArea = work.width * work.height;
  let best = pickOuterShell(polygons, canvasArea);
  if (!best) throw new OnlyFrameError('only the bitmap-frame curve was traced');

  let pts = hull ? convexHull(best) : best;
  pts = decimate(pts, maxPoints);
  pts = normalize(pts, pixels.width, pixels.height, pad, pad);

  const payload = buildPayload({
    src: resolved.src,
    width: pixels.width,
    height: pixels.height,
    pad,
    maxPoints,
    points: pts,
  });

  if (format === 'css') {
    return toCss(payload.points, options.selector);
  }
  if (format !== 'json') {
    throw new IpolypadError(`unsupported format: ${format}`);
  }
  return payload;
}

/** Same as `ipolypad(..., {format:'json'})` but returns the canonical JSON string. */
export async function ipolypadJsonString(input: Source, options: Options = {}): Promise<string> {
  const result = await ipolypad(input, { ...options, format: 'json' });
  return toJsonString(result as JsonResult);
}
