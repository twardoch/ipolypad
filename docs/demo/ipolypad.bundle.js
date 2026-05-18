// src/emit.ts
function roundN(x, decimals) {
  const f = 10 ** decimals;
  return Math.round(x * f) / f;
}
function buildPayload(args) {
  return {
    max_points: args.maxPoints,
    n_points: args.points.length,
    points: args.points.map(([x, y]) => [roundN(x, 6), roundN(y, 6)]),
    raster: { width: args.width, height: args.height, pad: args.pad },
    src: args.src
  };
}
function toJsonString(result) {
  return JSON.stringify(sortKeys(result), null, 2);
}
function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const out = {};
    for (const k of Object.keys(value).sort()) {
      out[k] = sortKeys(value[k]);
    }
    return out;
  }
  return value;
}
function toCss(points, selector) {
  const coords = points.map(([x, y]) => `${(x * 100).toFixed(2)}% ${(y * 100).toFixed(2)}%`).join(", ");
  const polygon = `polygon(${coords})`;
  if (!selector) return `${polygon};
`;
  return `${selector} {
  shape-outside: ${polygon};
  clip-path: ${polygon};
}
`;
}

// src/types.ts
var IpolypadError = class extends Error {
  name = "IpolypadError";
};
var SourceError = class extends IpolypadError {
  name = "SourceError";
};
var FormatError = class extends IpolypadError {
  name = "FormatError";
};
var EmptyMaskError = class extends IpolypadError {
  name = "EmptyMaskError";
};
var TraceEmptyError = class extends IpolypadError {
  name = "TraceEmptyError";
};
var OnlyFrameError = class extends IpolypadError {
  name = "OnlyFrameError";
};

// src/rasterize.ts
async function resolveSource(input) {
  if (typeof input === "string") {
    return resolveString(input);
  }
  if (input instanceof Uint8Array) {
    return classifyBytes(input, "<Uint8Array>");
  }
  if (typeof Blob !== "undefined" && input instanceof Blob) {
    const buf = new Uint8Array(await input.arrayBuffer());
    return classifyBytes(buf, "<Blob>");
  }
  if (typeof SVGElement !== "undefined" && input instanceof SVGElement) {
    return { kind: "svg-element", element: input, src: "<SVGElement>" };
  }
  if (typeof HTMLImageElement !== "undefined" && input instanceof HTMLImageElement) {
    return { kind: "img-element", element: input, src: input.src || "<HTMLImageElement>" };
  }
  throw new SourceError("unsupported source type");
}
async function resolveString(input) {
  if (input.trimStart().startsWith("<")) {
    return { kind: "svg", markup: input, src: "<inline-svg>" };
  }
  if (input.startsWith("data:")) {
    const commaIdx = input.indexOf(",");
    if (commaIdx < 0) throw new SourceError("malformed data: URL");
    const header = input.slice(5, commaIdx);
    const payload = input.slice(commaIdx + 1);
    const isBase64 = /;base64/i.test(header);
    if (/^image\/svg\+xml/i.test(header)) {
      const markup = isBase64 ? atob(payload) : decodeURIComponent(payload);
      return { kind: "svg", markup, src: input.slice(0, 64) + "\u2026" };
    }
    const bytes = isBase64 ? Uint8Array.from(atob(payload), (c) => c.charCodeAt(0)) : new TextEncoder().encode(decodeURIComponent(payload));
    return { kind: "image", data: bytes, src: input.slice(0, 64) + "\u2026" };
  }
  let resp;
  try {
    resp = await fetch(input);
  } catch (e) {
    throw new SourceError(`fetch failed: ${e.message}`);
  }
  if (!resp.ok) throw new SourceError(`HTTP ${resp.status} for ${input}`);
  const ct = resp.headers.get("content-type") ?? "";
  if (/svg/i.test(ct) || /\.svg(\?|$)/i.test(input)) {
    const markup = await resp.text();
    return { kind: "svg", markup, src: input };
  }
  const buf = new Uint8Array(await resp.arrayBuffer());
  return classifyBytes(buf, input);
}
function classifyBytes(data, src) {
  if (data.length > 0) {
    let i = 0;
    while (i < data.length && (data[i] === 32 || data[i] === 10 || data[i] === 13 || data[i] === 9)) i++;
    if (data[i] === 60) {
      const head = new TextDecoder().decode(data.subarray(0, Math.min(512, data.length)));
      if (head.includes("<svg") || head.startsWith("<?xml") || head.startsWith("<!--")) {
        return { kind: "svg", markup: new TextDecoder().decode(data), src };
      }
    }
  }
  return { kind: "image", data, src };
}
function sanitizeSvg(markup) {
  let out = markup;
  out = out.replace(/(<svg\b[^>]*?)\s+width="[^"]*"/i, "$1");
  out = out.replace(/(<svg\b[^>]*?)\s+height="[^"]*"/i, "$1");
  out = out.replace(/(<svg\b[^>]*?)\s+style="[^"]*"/i, "$1");
  return out;
}
function alphaFromRGBA(rgba, w, h) {
  const out = new Uint8Array(w * h);
  for (let i = 0, j = 3; i < out.length; i++, j += 4) {
    out[i] = rgba[j] ?? 0;
  }
  return out;
}
function maskFixed(alpha, threshold = 24) {
  const out = new Uint8Array(alpha.length);
  for (let i = 0; i < alpha.length; i++) {
    out[i] = alpha[i] > threshold ? 1 : 0;
  }
  return out;
}
function dilateCircular(mask, w, h, radius) {
  if (radius <= 0) return mask;
  const r = radius;
  const offsets = [];
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

// src/canvas.ts
function isBrowser() {
  return typeof document !== "undefined" && typeof HTMLCanvasElement !== "undefined";
}
function makeCanvas(width, height) {
  if (isBrowser()) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("failed to get 2d context");
    return { canvas, ctx };
  }
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("failed to get 2d context");
    return { canvas, ctx };
  }
  throw new Error(
    "no canvas implementation available. In Node install the `canvas` package and inject it via setCanvasFactory()."
  );
}
var _nodeFactory = null;
function setNodeCanvasFactory(factory) {
  _nodeFactory = factory;
}
async function loadImageBrowser(src) {
  return await new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    if (typeof src === "string") {
      img.src = src;
    } else {
      const blob = new Blob([src]);
      img.src = URL.createObjectURL(blob);
    }
  });
}
async function rasterizeSvg(markup, size, margin) {
  const inner = Math.max(8, size - 2 * margin);
  const clean = sanitizeSvg(markup);
  const sized = clean.replace(/<svg\b/, `<svg width="${inner}" height="${inner}"`);
  if (isBrowser() || typeof OffscreenCanvas !== "undefined") {
    const { canvas, ctx } = makeCanvas(size, size);
    const dataUrl = "data:image/svg+xml;utf8," + encodeURIComponent(sized);
    const img = await loadImageBrowser(dataUrl);
    const off = Math.floor((size - inner) / 2);
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(img, off, off, inner, inner);
    const pixels = ctx.getImageData(0, 0, size, size);
    return { width: size, height: size, rgba: pixels.data };
  }
  if (_nodeFactory) {
    return rasterizeViaNodeFactory(sized, size, margin);
  }
  throw new Error("no canvas runtime");
}
async function rasterizeImageBytes(bytes, size, margin) {
  const inner = Math.max(8, size - 2 * margin);
  if (isBrowser() || typeof OffscreenCanvas !== "undefined") {
    const { canvas, ctx } = makeCanvas(size, size);
    const img = await loadImageBrowser(bytes);
    const aspect = img.width / Math.max(1, img.height);
    const dw = aspect >= 1 ? inner : Math.max(1, Math.round(inner * aspect));
    const dh = aspect >= 1 ? Math.max(1, Math.round(inner / aspect)) : inner;
    const ox = Math.floor((size - dw) / 2);
    const oy = Math.floor((size - dh) / 2);
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(img, ox, oy, dw, dh);
    const pixels = ctx.getImageData(0, 0, size, size);
    return { width: size, height: size, rgba: pixels.data };
  }
  if (_nodeFactory) {
    return rasterizeViaNodeFactory(bytes, size, margin);
  }
  throw new Error("no canvas runtime");
}
async function rasterizeViaNodeFactory(src, size, margin) {
  if (!_nodeFactory) throw new Error("no node factory");
  const inner = Math.max(8, size - 2 * margin);
  const { canvas, ctx, loadImage, drawImage } = _nodeFactory(size, size);
  const img = await loadImage(src);
  const aspect = img.width / Math.max(1, img.height);
  const dw = aspect >= 1 ? inner : Math.max(1, Math.round(inner * aspect));
  const dh = aspect >= 1 ? Math.max(1, Math.round(inner / aspect)) : inner;
  const ox = Math.floor((size - dw) / 2);
  const oy = Math.floor((size - dh) / 2);
  ctx.clearRect(0, 0, size, size);
  drawImage(ctx, img, ox, oy, dw, dh);
  const pixels = ctx.getImageData(0, 0, size, size);
  return { width: size, height: size, rgba: pixels.data };
}
async function rasterizeElement(el, size, margin) {
  if (el instanceof SVGElement) {
    const markup = new XMLSerializer().serializeToString(el);
    return rasterizeSvg(markup, size, margin);
  }
  if (!el.complete) await new Promise((r) => el.addEventListener("load", () => r(null), { once: true }));
  const inner = Math.max(8, size - 2 * margin);
  const { canvas, ctx } = makeCanvas(size, size);
  const aspect = el.naturalWidth / Math.max(1, el.naturalHeight);
  const dw = aspect >= 1 ? inner : Math.max(1, Math.round(inner * aspect));
  const dh = aspect >= 1 ? Math.max(1, Math.round(inner / aspect)) : inner;
  const ox = Math.floor((size - dw) / 2);
  const oy = Math.floor((size - dh) / 2);
  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(el, ox, oy, dw, dh);
  const pixels = ctx.getImageData(0, 0, size, size);
  return { width: size, height: size, rgba: pixels.data };
}

// src/simplify.ts
function polygonArea(pts) {
  let a = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % n];
    a += x0 * y1 - x1 * y0;
  }
  return Math.abs(a) / 2;
}
function pickOuterShell(polygons, canvasArea, frameFraction = 0.95) {
  const filtered = polygons.filter((p) => polygonArea(p) < frameFraction * canvasArea);
  if (filtered.length === 0) return null;
  filtered.sort((a, b) => polygonArea(b) - polygonArea(a));
  return filtered[0];
}
function convexHull(pts) {
  const seen = /* @__PURE__ */ new Set();
  const uniq = [];
  for (const p of pts) {
    const k = `${p[0]},${p[1]}`;
    if (!seen.has(k)) {
      seen.add(k);
      uniq.push(p);
    }
  }
  uniq.sort((a, b) => a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]);
  if (uniq.length <= 1) return uniq;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of uniq) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper = [];
  for (let i = uniq.length - 1; i >= 0; i--) {
    const p = uniq[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
function rdp(pts, eps) {
  if (pts.length < 3) return pts.slice();
  const keep = new Array(pts.length).fill(false);
  keep[0] = true;
  keep[pts.length - 1] = true;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    if (e - s < 2) continue;
    const [x0, y0] = pts[s];
    const [x1, y1] = pts[e];
    const dx = x1 - x0;
    const dy = y1 - y0;
    const denom = Math.hypot(dx, dy) || 1;
    let bestI = -1;
    let bestD = -1;
    for (let i = s + 1; i < e; i++) {
      const [x, y] = pts[i];
      const d = Math.abs(dy * x - dx * y + x1 * y0 - y1 * x0) / denom;
      if (d > bestD) {
        bestD = d;
        bestI = i;
      }
    }
    if (bestD > eps) {
      keep[bestI] = true;
      stack.push([s, bestI]);
      stack.push([bestI, e]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}
function decimate(pts, maxPoints) {
  let work = pts;
  if (work.length >= 2) {
    const first = work[0];
    const last = work[work.length - 1];
    if (first[0] === last[0] && first[1] === last[1]) {
      work = work.slice(0, -1);
    }
  }
  if (work.length <= maxPoints) return work;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of work) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const diag = Math.hypot(maxX - minX, maxY - minY) || 1;
  let lo = 0;
  let hi = diag * 0.25;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    const out = rdp(work, mid);
    if (out.length > maxPoints) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return rdp(work, hi);
}
function normalize(pts, width, height) {
  return pts.map(([x, y]) => [x / width, y / height]);
}

// src/trace.ts
var _potraceFn = null;
function setPotrace(fn) {
  _potraceFn = fn;
}
async function getPotrace() {
  if (_potraceFn) return _potraceFn;
  const mod = await import('esm-potrace-wasm');
  const fn = mod.potrace ?? mod.default;
  if (!fn) throw new Error("esm-potrace-wasm did not export a callable potrace function");
  _potraceFn = fn;
  return _potraceFn;
}
function maskToImageData(mask, w, h) {
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0, j = 0; i < mask.length; i++, j += 4) {
    if (mask[i]) {
      rgba[j] = 0;
      rgba[j + 1] = 0;
      rgba[j + 2] = 0;
      rgba[j + 3] = 255;
    } else {
      rgba[j] = 255;
      rgba[j + 1] = 255;
      rgba[j + 2] = 255;
      rgba[j + 3] = 255;
    }
  }
  if (typeof ImageData !== "undefined") {
    return new ImageData(rgba, w, h);
  }
  return { data: rgba, width: w, height: h, colorSpace: "srgb" };
}
function tokenize(d) {
  const out = [];
  const re = /([MLCZmlcz])|(-?\d*\.?\d+(?:[eE][+-]?\d+)?)/g;
  const toks = [];
  let m;
  while ((m = re.exec(d)) !== null) {
    if (m[1]) toks.push({ cmd: m[1] });
    else if (m[2]) toks.push({ num: parseFloat(m[2]) });
  }
  let i = 0;
  let curX = 0, curY = 0;
  let startX = 0, startY = 0;
  while (i < toks.length) {
    const t = toks[i];
    if (!t.cmd) {
      i++;
      continue;
    }
    const c = t.cmd;
    i++;
    if (c === "Z" || c === "z") {
      out.push({ kind: "Z", nums: [] });
      curX = startX;
      curY = startY;
      continue;
    }
    const expect = c === "M" || c === "m" || c === "L" || c === "l" ? 2 : c === "C" || c === "c" ? 6 : 0;
    const relative = c === c.toLowerCase();
    let first = true;
    while (i < toks.length && toks[i].num !== void 0) {
      const ns = [];
      for (let k = 0; k < expect; k++) {
        if (i >= toks.length || toks[i].num === void 0) break;
        ns.push(toks[i].num);
        i++;
      }
      if (ns.length !== expect) break;
      let abs = ns.slice();
      if (relative) {
        for (let k = 0; k < abs.length; k += 2) {
          abs[k] = abs[k] + curX;
          abs[k + 1] = abs[k + 1] + curY;
        }
      }
      const upper = c.toUpperCase();
      let kind = upper;
      if (upper === "M" && !first) kind = "L";
      out.push({ kind, nums: abs });
      if (kind === "M") {
        startX = abs[0];
        startY = abs[1];
      }
      curX = abs[abs.length - 2];
      curY = abs[abs.length - 1];
      first = false;
    }
  }
  return out;
}
function cubic(p0, p1, p2, p3, samplesPerCurve) {
  const out = [];
  for (let i = 1; i <= samplesPerCurve; i++) {
    const t = i / samplesPerCurve;
    const u = 1 - t;
    const bx = u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0];
    const by = u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1];
    out.push([bx, by]);
  }
  return out;
}
function parsePotraceSvg(svg, samplesPerCurve) {
  const polygons = [];
  const pathRe = /<path[^>]*\sd="([^"]+)"/g;
  let pathMatch;
  while ((pathMatch = pathRe.exec(svg)) !== null) {
    const d = pathMatch[1];
    const cmds = tokenize(d);
    let cur = null;
    let start = null;
    let buf = [];
    const flush = () => {
      if (buf.length >= 3) polygons.push(buf);
      buf = [];
    };
    for (const cmd of cmds) {
      if (cmd.kind === "M") {
        if (buf.length > 0) flush();
        const p = [cmd.nums[0], cmd.nums[1]];
        cur = p;
        start = p;
        buf.push(p);
      } else if (cmd.kind === "L") {
        const p = [cmd.nums[0], cmd.nums[1]];
        if (cur) buf.push(p);
        cur = p;
      } else if (cmd.kind === "C") {
        if (!cur) continue;
        const p1 = [cmd.nums[0], cmd.nums[1]];
        const p2 = [cmd.nums[2], cmd.nums[3]];
        const p3 = [cmd.nums[4], cmd.nums[5]];
        buf.push(...cubic(cur, p1, p2, p3, samplesPerCurve));
        cur = p3;
      } else if (cmd.kind === "Z") {
        if (start && cur && (cur[0] !== start[0] || cur[1] !== start[1])) ;
        flush();
        cur = start;
      }
    }
    if (buf.length > 0) flush();
  }
  return polygons;
}
async function traceMask(mask, w, h, samplesPerCurve) {
  const potrace = await getPotrace();
  const img = maskToImageData(mask, w, h);
  const svg = await potrace(img, {
    turdsize: 2,
    turnpolicy: 0,
    alphamax: 1,
    optcurve: true,
    extractcolors: false
  });
  return parsePotraceSvg(svg, samplesPerCurve);
}

// src/index.ts
var DEFAULTS = {
  size: 200,
  margin: 20,
  pad: 6,
  maxPoints: 32,
  samplesPerCurve: 4,
  hull: true,
  format: "json"
};
async function ipolypad(input, options = {}) {
  const size = options.size ?? DEFAULTS.size;
  const margin = options.margin ?? DEFAULTS.margin;
  const pad = options.pad ?? DEFAULTS.pad;
  const maxPoints = options.maxPoints ?? DEFAULTS.maxPoints;
  const samplesPerCurve = options.samplesPerCurve ?? DEFAULTS.samplesPerCurve;
  const hull = options.hull ?? DEFAULTS.hull;
  const format = options.format ?? DEFAULTS.format;
  const resolved = await resolveSource(input);
  let pixels;
  if (resolved.kind === "svg") {
    pixels = await rasterizeSvg(resolved.markup, size, margin);
  } else if (resolved.kind === "image") {
    pixels = await rasterizeImageBytes(resolved.data, size, margin);
  } else if (resolved.kind === "svg-element" || resolved.kind === "img-element") {
    pixels = await rasterizeElement(resolved.element, size, margin);
  } else {
    throw new SourceError("unsupported source kind");
  }
  const alpha = alphaFromRGBA(pixels.rgba, pixels.width, pixels.height);
  let mask = maskFixed(alpha, 24);
  let any = false;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i]) {
      any = true;
      break;
    }
  }
  if (!any) throw new EmptyMaskError("no foreground above alpha threshold (24)");
  mask = dilateCircular(mask, pixels.width, pixels.height, pad);
  const polygons = await traceMask(mask, pixels.width, pixels.height, samplesPerCurve);
  if (polygons.length === 0) throw new TraceEmptyError("potrace produced no curves");
  const canvasArea = pixels.width * pixels.height;
  let best = pickOuterShell(polygons, canvasArea);
  if (!best) throw new OnlyFrameError("only the bitmap-frame curve was traced");
  let pts = hull ? convexHull(best) : best;
  pts = decimate(pts, maxPoints);
  pts = normalize(pts, pixels.width, pixels.height);
  const payload = buildPayload({
    src: resolved.src,
    width: pixels.width,
    height: pixels.height,
    pad,
    maxPoints,
    points: pts
  });
  if (format === "css") {
    return toCss(payload.points, options.selector);
  }
  if (format !== "json") {
    throw new IpolypadError(`unsupported format: ${format}`);
  }
  return payload;
}
async function ipolypadJsonString(input, options = {}) {
  const result = await ipolypad(input, { ...options, format: "json" });
  return toJsonString(result);
}

export { EmptyMaskError, FormatError, IpolypadError, OnlyFrameError, SourceError, TraceEmptyError, buildPayload, convexHull, decimate, ipolypad, ipolypadJsonString, normalize, pickOuterShell, polygonArea, rdp, setNodeCanvasFactory, setPotrace, toCss, toJsonString };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map