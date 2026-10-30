/**
 * A curve's line across a track, in device pixels, decimated with M4 when
 * there are more visible samples than the track has pixel rows to show, and
 * the wrapped line of an off-scale curve. Fills (fill.ts) share the rows.
 */

import type { Mapping } from "./scale.ts";

/**
 * What a track draws into: an interval of the view's depth axis (axis.ts)
 * over a canvas, in device px. Every function here takes the rows' depths
 * on that axis: MD, or TVDSS, infinite on rows without it.
 */
export interface Frame {
  /** The axis depth at the top edge. */
  readonly top: number;
  /** The axis depth at the bottom edge. */
  readonly base: number;
  readonly width: number;
  readonly height: number;
}

/** Device px per depth unit. */
export function pixelsPerUnit(frame: Frame): number {
  return frame.height / (frame.base - frame.top);
}

/** The first row whose depth is at or below `depth`; `depths.length` when there is none. */
export function firstRowAtOrBelow(depths: Float64Array, depth: number): number {
  let lo = 0;
  let hi = depths.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (depths[mid] < depth) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * The rows to draw, [start, end): those inside the frame plus one more on
 * each side, so a line runs on to the edges instead of stopping short.
 */
export function visibleRows(depths: Float64Array, frame: Frame): [number, number] {
  return [
    Math.max(0, firstRowAtOrBelow(depths, frame.top) - 1),
    Math.min(depths.length, firstRowAtOrBelow(depths, frame.base) + 1),
  ];
}

/** M4 runs when the visible samples exceed this many per device-pixel row. */
export const M4_THRESHOLD = 4;

/**
 * The rows a line is drawn through, in order, with -1 wherever it breaks.
 * Every row where a source has no value breaks it, so it never joins across
 * a gap or a missing value, and so does every row with no place on the
 * axis. Above M4_THRESHOLD samples per pixel row, each
 * row keeps only its first and last sample, and each source's minimum and
 * maximum (M4).
 *
 * Each source is a curve's values, or their log10 on a log scale. A fill
 * passes both its curves, so its two boundaries share their rows.
 *
 * A curve's line, its wrapped line and the fills along it ask for the same
 * rows in one redraw, so the last few answers per source are kept and
 * returned as they are: callers must not change them.
 */
export function drawnRows(depths: Float64Array, sources: readonly Float32Array[], frame: Frame): Int32Array {
  if (sources.length === 0) return findDrawnRows(depths, sources, frame);
  const recent = keptRows.get(sources[0]) ?? [];
  const kept = recent.find(
    (m) =>
      m.depths === depths &&
      m.top === frame.top &&
      m.base === frame.base &&
      m.height === frame.height &&
      m.sources.length === sources.length &&
      m.sources.every((source, s) => source === sources[s]),
  );
  if (kept) return kept.rows;
  const rows = findDrawnRows(depths, sources, frame);
  recent.unshift({ depths, sources: [...sources], top: frame.top, base: frame.base, height: frame.height, rows });
  if (recent.length > KEPT_PER_SOURCE) recent.pop();
  keptRows.set(sources[0], recent);
  return rows;
}

/** One drawnRows answer, for the depths, sources and frame it was asked for. */
interface KeptRows {
  readonly depths: Float64Array;
  readonly sources: readonly Float32Array[];
  readonly top: number;
  readonly base: number;
  readonly height: number;
  readonly rows: Int32Array;
}

/** drawnRows answers kept per first source, newest first. */
const keptRows = new WeakMap<Float32Array, KeptRows[]>();
const KEPT_PER_SOURCE = 4;

/** findDrawnRows's working buffer, grown to the most rows asked for. */
let scratch = new Int32Array(0);

/** Whether the line breaks at row i: no place on the axis, or a source without a value. */
function breaksAt(depths: Float64Array, sources: readonly Float32Array[], i: number): boolean {
  if (!Number.isFinite(depths[i])) return true;
  for (let s = 0; s < sources.length; s++) if (!Number.isFinite(sources[s][i])) return true;
  return false;
}

/**
 * drawnRows, worked out. It runs over every visible sample of every curve
 * drawn, so it allocates nothing per sample, and works in one buffer kept
 * between calls: each row adds at most one entry, a row or a break, which
 * bounds the output. Only the answer is copied out.
 */
function findDrawnRows(depths: Float64Array, sources: readonly Float32Array[], frame: Frame): Int32Array {
  const [start, end] = visibleRows(depths, frame);
  if (scratch.length < end - start) scratch = new Int32Array(end - start);
  const out = scratch;
  let length = 0;
  let broken = true;

  if (end - start <= frame.height * M4_THRESHOLD) {
    for (let i = start; i < end; i++) {
      if (!breaksAt(depths, sources, i)) {
        out[length++] = i;
        broken = false;
      } else if (!broken) {
        out[length++] = -1;
        broken = true;
      }
    }
    return out.slice(0, length);
  }

  const n = sources.length;
  const k = pixelsPerUnit(frame);
  let row = NaN;
  let first = -1;
  let last = -1;
  const min = new Int32Array(n);
  const max = new Int32Array(n);
  // A pixel row's first, minima, maxima and last, sorted for drawing.
  const picked = new Int32Array(2 + 2 * n);
  const flush = () => {
    if (first === -1) return;
    picked[0] = first;
    picked.set(min, 1);
    picked.set(max, 1 + n);
    picked[picked.length - 1] = last;
    picked.sort();
    for (let j = 0; j < picked.length; j++) if (j === 0 || picked[j] !== picked[j - 1]) out[length++] = picked[j];
    broken = false;
    first = -1;
  };
  for (let i = start; i < end; i++) {
    if (breaksAt(depths, sources, i)) {
      flush();
      if (!broken) {
        out[length++] = -1;
        broken = true;
      }
      continue;
    }
    const r = Math.floor((depths[i] - frame.top) * k);
    if (r !== row) {
      flush();
      row = r;
    }
    if (first === -1) {
      first = i;
      min.fill(i);
      max.fill(i);
    } else {
      for (let s = 0; s < n; s++) {
        const source = sources[s];
        if (source[i] < source[min[s]]) min[s] = i;
        if (source[i] > source[max[s]]) max[s] = i;
      }
    }
    last = i;
  }
  flush();
  return out.slice(0, length);
}

/**
 * How far past a scale end, as a fraction of the track width, a value still
 * counts as on the scale. It lets float32 values such as a 26-in bit stored
 * as 26.000002 draw on the end instead of falling off it.
 */
export const END_TOLERANCE = 1e-4;

/**
 * Which way a fraction lies off the scale: -1 past the right end, 1 short of
 * the left one, 0 on it. The sign is the shift that wraps it back.
 */
function offScaleShift(fraction: number): -1 | 0 | 1 {
  return fraction > 1 + END_TOLERANCE ? -1 : fraction < -END_TOLERANCE ? 1 : 0;
}

/**
 * Value → x: fraction = a · source + b, then across the frame. On the scale
 * (within the tolerance) x stays `inset` device px inside the track, so a
 * line on an end draws whole; off it, x runs out of the track.
 */
function placement(mapping: Mapping, frame: Frame, inset: number) {
  const edge = Math.min(inset, frame.width / 2);
  return {
    fraction: (value: number) => mapping.a * value + mapping.b,
    x(fraction: number) {
      const x = fraction * frame.width;
      if (offScaleShift(fraction)) return x;
      return Math.min(frame.width - edge, Math.max(edge, x));
    },
  };
}

/**
 * The line as flat [x, y, x, y, …] pairs, with a NaN pair wherever it breaks
 * (see drawnRows). An off-scale value runs out of the track and the canvas
 * cuts it there; it is never pinned to the edge.
 *
 * `inset` is in device px, usually half the line width.
 */
export function curvePolyline(
  depths: Float64Array,
  source: Float32Array,
  mapping: Mapping,
  frame: Frame,
  inset = 0,
): Float32Array {
  const rows = drawnRows(depths, [source], frame);
  const { fraction, x } = placement(mapping, frame, inset);
  const k = pixelsPerUnit(frame);
  const out = new Float32Array(rows.length * 2);
  for (let j = 0; j < rows.length; j++) {
    const i = rows[j];
    out[2 * j] = i < 0 ? NaN : x(fraction(source[i]));
    out[2 * j + 1] = i < 0 ? NaN : (depths[i] - frame.top) * k;
  }
  return out;
}

/**
 * The wrapped line of a `wrap` entry: each off-scale stretch shifted back by
 * one scale width (one span on a log scale, since `source` is log10 there).
 * A stretch past the right end comes in from the left edge and leaves by it,
 * and the other way round, so it carries on where the line ran out. A value
 * still off the scale after one shift runs out of the track and is cut.
 */
export function wrappedPolyline(
  depths: Float64Array,
  source: Float32Array,
  mapping: Mapping,
  frame: Frame,
  inset = 0,
): Float32Array {
  const rows = drawnRows(depths, [source], frame);
  const { fraction, x } = placement(mapping, frame, inset);
  const k = pixelsPerUnit(frame);
  const out: number[] = [];
  let broken = true;
  const push = (i: number, shift: number) => {
    out.push(x(fraction(source[i]) + shift), (depths[i] - frame.top) * k);
    broken = false;
  };
  const lineBreak = () => {
    if (broken) return;
    out.push(NaN, NaN);
    broken = true;
  };

  let run = 0; // the shift of the stretch being drawn; 0 between stretches
  let prev = -1; // the row before, or -1 after a break
  for (const i of rows) {
    if (i < 0) {
      lineBreak();
      run = 0;
      prev = -1;
      continue;
    }
    const shift = offScaleShift(fraction(source[i]));
    if (shift !== run) {
      // Leave by the edge, then come in by the other one.
      if (run) {
        push(i, run);
        lineBreak();
      }
      if (shift && prev >= 0) push(prev, shift);
      run = shift;
    }
    if (shift) push(i, shift);
    prev = i;
  }
  if (broken) out.length = Math.max(0, out.length - 2); // no trailing break
  return Float32Array.from(out);
}
