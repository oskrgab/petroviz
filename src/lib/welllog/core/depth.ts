/**
 * Depth queries on a well log.
 *
 * A row stands for the interval from its MD down to the next row's, the same
 * way a discrete block or zone is drawn. So a depth inside a gap finds the
 * gap row, and reads as "no value", however far below the gap row it is.
 */

import type { Curve, WellLog } from "./wellLog.ts";

/**
 * The row whose interval holds `depth` (MD): the last row at or above it.
 * -1 when the depth is above the first row, below the last, or NaN.
 */
export function indexAtDepth(log: WellLog, depth: number): number {
  const { md } = log;
  const last = md.length - 1;
  if (!(depth >= md[0] && depth <= md[last])) return -1;
  let lo = 0;
  let hi = last;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (md[mid] <= depth) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** The curve's value at `depth` (MD), or NaN where it has none. */
export function valueAt(log: WellLog, curve: Curve, depth: number): number {
  const i = indexAtDepth(log, depth);
  return i === -1 ? NaN : curve.values[i];
}
