// this_file: ipolypad_js/src/canvas.ts
// Cross-environment canvas rasterizer. Browser uses OffscreenCanvas/HTMLCanvasElement;
// Node falls back to the `canvas` package if available.

import { prepareSvgForRaster } from './rasterize.js';

export interface RasterPixels {
  width: number;
  height: number;
  rgba: Uint8ClampedArray | Uint8Array;
}

function isBrowser(): boolean {
  return typeof document !== 'undefined' && typeof HTMLCanvasElement !== 'undefined';
}

function makeCanvas(width: number, height: number): {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
} {
  if (isBrowser()) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('failed to get 2d context');
    return { canvas, ctx };
  }
  // Node: try OffscreenCanvas if globalThis has it (e.g. workerd), else node-canvas.
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('failed to get 2d context');
    return { canvas, ctx };
  }
  throw new Error(
    'no canvas implementation available. In Node install the `canvas` package and inject it via setCanvasFactory().',
  );
}

type NodeCanvasFactory = (w: number, h: number) => {
  canvas: { getContext: (t: '2d') => unknown; toBuffer?: () => Uint8Array };
  ctx: CanvasRenderingContext2D;
  loadImage: (src: string | Uint8Array) => Promise<{ width: number; height: number }>;
  drawImage: (ctx: CanvasRenderingContext2D, img: { width: number; height: number }, dx: number, dy: number, dw: number, dh: number) => void;
};

let _nodeFactory: NodeCanvasFactory | null = null;

/** Inject a node-canvas adapter at runtime. Used by the test suite. */
export function setNodeCanvasFactory(factory: NodeCanvasFactory | null): void {
  _nodeFactory = factory;
}

async function loadImageBrowser(src: string | Uint8Array): Promise<HTMLImageElement> {
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    if (typeof src === 'string') {
      img.src = src;
    } else {
      const blob = new Blob([src as unknown as ArrayBuffer]);
      img.src = URL.createObjectURL(blob);
    }
  });
}

/** Rasterize an SVG markup string to RGBA of size×size with a transparent gutter. */
export async function rasterizeSvg(markup: string, size: number, margin: number): Promise<RasterPixels> {
  const inner = Math.max(8, size - 2 * margin);
  const clean = prepareSvgForRaster(markup);
  // Force inner-box dimensions so the browser/canvas paints at our size.
  const sized = clean.replace(/<svg\b/, `<svg width="${inner}" height="${inner}"`);
  if (isBrowser() || typeof OffscreenCanvas !== 'undefined') {
    const { canvas, ctx } = makeCanvas(size, size);
    const dataUrl = 'data:image/svg+xml;utf8,' + encodeURIComponent(sized);
    const img = await loadImageBrowser(dataUrl);
    const off = Math.floor((size - inner) / 2);
    (ctx as CanvasRenderingContext2D).clearRect(0, 0, size, size);
    (ctx as CanvasRenderingContext2D).drawImage(img, off, off, inner, inner);
    const pixels = (ctx as CanvasRenderingContext2D).getImageData(0, 0, size, size);
    return { width: size, height: size, rgba: pixels.data };
  }
  if (_nodeFactory) {
    return rasterizeViaNodeFactory(sized, size, margin);
  }
  throw new Error('no canvas runtime');
}

/** Rasterize raster image bytes (PNG/JPEG/etc.) to RGBA of size×size with gutter. */
export async function rasterizeImageBytes(bytes: Uint8Array, size: number, margin: number): Promise<RasterPixels> {
  const inner = Math.max(8, size - 2 * margin);
  if (isBrowser() || typeof OffscreenCanvas !== 'undefined') {
    const { canvas, ctx } = makeCanvas(size, size);
    const img = await loadImageBrowser(bytes);
    const aspect = img.width / Math.max(1, img.height);
    const dw = aspect >= 1 ? inner : Math.max(1, Math.round(inner * aspect));
    const dh = aspect >= 1 ? Math.max(1, Math.round(inner / aspect)) : inner;
    const ox = Math.floor((size - dw) / 2);
    const oy = Math.floor((size - dh) / 2);
    (ctx as CanvasRenderingContext2D).clearRect(0, 0, size, size);
    (ctx as CanvasRenderingContext2D).drawImage(img, ox, oy, dw, dh);
    const pixels = (ctx as CanvasRenderingContext2D).getImageData(0, 0, size, size);
    return { width: size, height: size, rgba: pixels.data };
  }
  if (_nodeFactory) {
    return rasterizeViaNodeFactory(bytes, size, margin);
  }
  throw new Error('no canvas runtime');
}

async function rasterizeViaNodeFactory(src: string | Uint8Array, size: number, margin: number): Promise<RasterPixels> {
  if (!_nodeFactory) throw new Error('no node factory');
  const inner = Math.max(8, size - 2 * margin);
  const { canvas, ctx, loadImage, drawImage } = _nodeFactory(size, size);
  const img = await loadImage(src);
  const aspect = img.width / Math.max(1, img.height);
  const dw = aspect >= 1 ? inner : Math.max(1, Math.round(inner * aspect));
  const dh = aspect >= 1 ? Math.max(1, Math.round(inner / aspect)) : inner;
  const ox = Math.floor((size - dw) / 2);
  const oy = Math.floor((size - dh) / 2);
  (ctx as CanvasRenderingContext2D).clearRect(0, 0, size, size);
  drawImage(ctx, img, ox, oy, dw, dh);
  const pixels = (ctx as CanvasRenderingContext2D).getImageData(0, 0, size, size);
  return { width: size, height: size, rgba: pixels.data };
}

/** Read pixels of an existing DOM SVG or img element. */
export async function rasterizeElement(el: SVGElement | HTMLImageElement, size: number, margin: number): Promise<RasterPixels> {
  if (el instanceof SVGElement) {
    const markup = new XMLSerializer().serializeToString(el);
    return rasterizeSvg(markup, size, margin);
  }
  // HTMLImageElement — wait until it's loaded
  if (!el.complete) await new Promise((r) => el.addEventListener('load', () => r(null), { once: true }));
  const inner = Math.max(8, size - 2 * margin);
  const { canvas, ctx } = makeCanvas(size, size);
  const aspect = el.naturalWidth / Math.max(1, el.naturalHeight);
  const dw = aspect >= 1 ? inner : Math.max(1, Math.round(inner * aspect));
  const dh = aspect >= 1 ? Math.max(1, Math.round(inner / aspect)) : inner;
  const ox = Math.floor((size - dw) / 2);
  const oy = Math.floor((size - dh) / 2);
  (ctx as CanvasRenderingContext2D).clearRect(0, 0, size, size);
  (ctx as CanvasRenderingContext2D).drawImage(el, ox, oy, dw, dh);
  const pixels = (ctx as CanvasRenderingContext2D).getImageData(0, 0, size, size);
  return { width: size, height: size, rgba: pixels.data };
}
