/**
 * A curve's line across a track, in device pixels, decimated with M4 when
 * there are more visible samples than the track has pixel rows to show, and
 * the wrapped line of an off-scale curve. Fills (fill.ts) share the rows.
 */

import type { Mapping } from "./scale.ts";

/** What a track draws into: an MD interval over a canvas, in device px. */
export interface Frame {
  /** MD at the top edge. */
  readonly top: number;
  /** MD at the bottom edge. */
  readonly base: number;
  readonly width: number;
  readonly height: number;
}

/** Device px per depth unit. */
export function pixelsPerUnit(frame: Frame): number {
  return frame.height / (frame.base - frame.top);
}

/** The first row whose MD is at or below `depth`; `md.length` when there is none. */
export function firstRowAtOrBelow(md: Float64Array, depth: number): number {
  let lo = 0;
  let hi = md.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (md[mid] < depth) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * The rows to draw, [start, end): those inside the frame plus one more on
 * each side, so a line runs on to the edges instead of stopping short.
 */
export function visibleRows(md: Float64Array, frame: Frame): [number, number] {
  return [
    Math.max(0, firstRowAtOrBelow(md, frame.top) - 1),
    Math.min(md.length, firstRowAtOrBelow(md, frame.base) + 1),
  ];
}

/** M4 runs when the visible samples exceed this many per device-pixel row. */
export const M4_THRESHOLD = 4;

/**
 * The rows a line is drawn through, in order, with -1 wherever it breaks.
 * Every row where a source has no value breaks it, so it never joins across
 * a gap or a missing value. Above M4_THRESHOLD samples per pixel row, each
 * row keeps only its first and last sample, and each source's minimum and
 * maximum (M4).
 *
 * Each source is a curve's values, or their log10 on a log scale. A fill
 * passes both its curves, so its two boundaries share their rows.
 */
export function drawnRows(md: Float64Array, sources: readonly Float32Array[], frame: Frame): Int32Array {
  const [start, end] = visibleRows(md, frame);
  const out: number[] = [];
  let broken = true;
  const push = (i: number) => {
    out.push(i);
    broken = false;
  };
  const lineBreak = () => {
    if (broken) return;
    out.push(-1);
    broken = true;
  };
  const isBreak = (i: number) => sources.some((source) => !Number.isFinite(source[i]));

  if (end - start <= frame.height * M4_THRESHOLD) {
    for (let i = start; i < end; i++) {
      if (isBreak(i)) lineBreak();
      else push(i);
    }
    return Int32Array.from(out);
  }

  const k = pixelsPerUnit(frame);
  let row = NaN;
  let first = -1;
  let last = -1;
  const min = sources.map(() => -1);
  const max = sources.map(() => -1);
  const flush = () => {
    if (first === -1) return;
    const picked = [first, ...min, ...max, last].sort((p, q) => p - q);
    for (let j = 0; j < picked.length; j++) if (j === 0 || picked[j] !== picked[j - 1]) push(picked[j]);
    first = -1;
  };
  for (let i = start; i < end; i++) {
    if (isBreak(i)) {
      flush();
      lineBreak();
      continue;
    }
    const r = Math.floor((md[i] - frame.top) * k);
    if (r !== row) {
      flush();
      row = r;
    }
    if (first === -1) {
      first = i;
      min.fill(i);
      max.fill(i);
    } else {
      sources.forEach((source, s) => {
        if (source[i] < source[min[s]]) min[s] = i;
        if (source[i] > source[max[s]]) max[s] = i;
      });
    }
    last = i;
  }
  flush();
  return Int32Array.from(out);
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
  md: Float64Array,
  source: Float32Array,
  mapping: Mapping,
  frame: Frame,
  inset = 0,
): Float32Array {
  const rows = drawnRows(md, [source], frame);
  const { fraction, x } = placement(mapping, frame, inset);
  const k = pixelsPerUnit(frame);
  const out = new Float32Array(rows.length * 2);
  for (let j = 0; j < rows.length; j++) {
    const i = rows[j];
    out[2 * j] = i < 0 ? NaN : x(fraction(source[i]));
    out[2 * j + 1] = i < 0 ? NaN : (md[i] - frame.top) * k;
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
  md: Float64Array,
  source: Float32Array,
  mapping: Mapping,
  frame: Frame,
  inset = 0,
): Float32Array {
  const rows = drawnRows(md, [source], frame);
  const { fraction, x } = placement(mapping, frame, inset);
  const k = pixelsPerUnit(frame);
  const out: number[] = [];
  let broken = true;
  const push = (i: number, shift: number) => {
    out.push(x(fraction(source[i]) + shift), (md[i] - frame.top) * k);
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
