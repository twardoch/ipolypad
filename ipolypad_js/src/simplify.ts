// this_file: ipolypad_js/src/simplify.ts
// SPEC §2.6–§2.9. Geometry utilities — pure, deterministic, no I/O.

import type { Point } from './types.js';

export function polygonArea(pts: Point[]): number {
  let a = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const [x0, y0] = pts[i]!;
    const [x1, y1] = pts[(i + 1) % n]!;
    a += x0 * y1 - x1 * y0;
  }
  return Math.abs(a) / 2;
}

export function pickOuterShell(
  polygons: Point[][],
  canvasArea: number,
  frameFraction = 0.95,
): Point[] | null {
  const filtered = polygons.filter((p) => polygonArea(p) < frameFraction * canvasArea);
  if (filtered.length === 0) return null;
  filtered.sort((a, b) => polygonArea(b) - polygonArea(a));
  return filtered[0]!;
}

/** Andrew's monotone chain. CCW, no closing duplicate. SPEC §2.7. */
export function convexHull(pts: Point[]): Point[] {
  // de-dup and sort by (x,y)
  const seen = new Set<string>();
  const uniq: Point[] = [];
  for (const p of pts) {
    const k = `${p[0]},${p[1]}`;
    if (!seen.has(k)) {
      seen.add(k);
      uniq.push(p);
    }
  }
  uniq.sort((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]));
  if (uniq.length <= 1) return uniq;

  const cross = (o: Point, a: Point, b: Point) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

  const lower: Point[] = [];
  for (const p of uniq) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: Point[] = [];
  for (let i = uniq.length - 1; i >= 0; i--) {
    const p = uniq[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** Iterative Ramer-Douglas-Peucker. */
export function rdp(pts: Point[], eps: number): Point[] {
  if (pts.length < 3) return pts.slice();
  const keep = new Array<boolean>(pts.length).fill(false);
  keep[0] = true;
  keep[pts.length - 1] = true;
  const stack: Array<[number, number]> = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    if (e - s < 2) continue;
    const [x0, y0] = pts[s]!;
    const [x1, y1] = pts[e]!;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const denom = Math.hypot(dx, dy) || 1;
    let bestI = -1;
    let bestD = -1;
    for (let i = s + 1; i < e; i++) {
      const [x, y] = pts[i]!;
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

/** Vertex-count-targeted decimation. SPEC §2.8. */
export function decimate(pts: Point[], maxPoints: number): Point[] {
  let work = pts;
  if (work.length >= 2) {
    const first = work[0]!;
    const last = work[work.length - 1]!;
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

export function normalize(pts: Point[], width: number, height: number): Point[] {
  return pts.map(([x, y]) => [x / width, y / height] as Point);
}
