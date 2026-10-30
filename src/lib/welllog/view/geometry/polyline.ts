/**
 * A curve's line across a track, in device pixels, decimated with M4 when
 * there are more visible samples than the track has pixel rows to show.
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

/**
 * The rows to draw, [start, end): those inside the frame plus one more on
 * each side, so a line runs on to the edges instead of stopping short.
 */
export function visibleRows(md: Float64Array, frame: Frame): [number, number] {
  const firstBelow = (depth: number) => {
    let lo = 0;
    let hi = md.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (md[mid] < depth) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  return [Math.max(0, firstBelow(frame.top) - 1), Math.min(md.length, firstBelow(frame.base) + 1)];
}

/** M4 runs when the visible samples exceed this many per device-pixel row. */
export const M4_THRESHOLD = 4;

/**
 * The line as flat [x, y, x, y, …] pairs. A NaN pair breaks the line: every
 * row with no value breaks it, so it never joins across a gap or a missing
 * value. x is never clamped (see scale.ts).
 *
 * `source` is the curve's values, or their log10 on a log scale, and
 * `mapping` turns it into a fraction of the width.
 */
export function curvePolyline(
  md: Float64Array,
  source: Float32Array,
  mapping: Mapping,
  frame: Frame,
): Float32Array {
  const [start, end] = visibleRows(md, frame);
  const k = pixelsPerUnit(frame);
  const scaleX = mapping.a * frame.width;
  const offsetX = mapping.b * frame.width;
  const out: number[] = [];
  let broken = true;

  const push = (i: number) => {
    out.push(scaleX * source[i] + offsetX, (md[i] - frame.top) * k);
    broken = false;
  };
  const lineBreak = () => {
    if (broken) return;
    out.push(NaN, NaN);
    broken = true;
  };
  const isBreak = (i: number) => !Number.isFinite(scaleX * source[i] + offsetX);

  if (end - start <= frame.height * M4_THRESHOLD) {
    for (let i = start; i < end; i++) {
      if (isBreak(i)) lineBreak();
      else push(i);
    }
    return Float32Array.from(out);
  }

  // M4: per pixel row, the first, minimum, maximum and last sample, in row order.
  let row = NaN;
  let first = -1;
  let min = -1;
  let max = -1;
  let last = -1;
  const flush = () => {
    if (first === -1) return;
    const picked = [first, min, max, last].sort((p, q) => p - q);
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
      first = min = max = i;
    } else {
      if (source[i] < source[min]) min = i;
      if (source[i] > source[max]) max = i;
    }
    last = i;
  }
  flush();
  return Float32Array.from(out);
}
