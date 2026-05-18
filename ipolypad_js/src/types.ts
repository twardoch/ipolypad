// this_file: ipolypad_js/src/types.ts
// SPEC §5.1. Public types.

export type Point = [number, number];

export type Source =
  | string                  // URL, data: URL, http(s)://, or plain SVG markup
  | Uint8Array              // raw bytes
  | Blob                    // typically from <input type=file>
  | SVGElement              // DOM-resident SVG
  | HTMLImageElement;       // pre-loaded image

export interface Options {
  /** Raster canvas size in px (square). Default 200. */
  size?: number;
  /** Transparent gutter for dilation room. Default 20. */
  margin?: number;
  /** Dilation radius in pixels. Default 6. */
  pad?: number;
  /** Final vertex cap. Default 32. */
  maxPoints?: number;
  /** Bezier flatten sample count. Default 4. */
  samplesPerCurve?: number;
  /** Apply convex envelope. Default true. */
  hull?: boolean;
  /** Output format. Default 'json'. */
  format?: 'json' | 'css';
  /** When format='css', wrap in a selector block. */
  selector?: string;
}

export interface JsonResult {
  src: string;
  raster: { width: number; height: number; pad: number };
  max_points: number;
  n_points: number;
  points: Point[];
}

export class IpolypadError extends Error {
  override name = 'IpolypadError';
}
export class SourceError extends IpolypadError { override name = 'SourceError'; }
export class FormatError extends IpolypadError { override name = 'FormatError'; }
export class EmptyMaskError extends IpolypadError { override name = 'EmptyMaskError'; }
export class TraceEmptyError extends IpolypadError { override name = 'TraceEmptyError'; }
export class OnlyFrameError extends IpolypadError { override name = 'OnlyFrameError'; }
