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

/**
 * TVDSS at `depth` (MD), linear between the valid samples on either side
 * of it; NaN outside them, never extrapolated, and NaN without TVDSS.
 */
export function tvdssAt(log: WellLog, depth: number): number {
  const { md, tvdss } = log;
  if (!tvdss) return NaN;
  const row = indexAtDepth(log, depth);
  if (row === -1) return NaN;
  let above = row;
  while (above >= 0 && Number.isNaN(tvdss[above])) above--;
  if (above === -1) return NaN;
  if (md[above] === depth) return tvdss[above];
  let below = row + 1;
  while (below < md.length && Number.isNaN(tvdss[below])) below++;
  if (below === md.length) return NaN;
  return tvdss[above] + ((depth - md[above]) / (md[below] - md[above])) * (tvdss[below] - tvdss[above]);
}

/** The first row from `i` on, stepping by `dir`, that holds a number; -1 when there is none. */
function validFrom(values: Float64Array, i: number, dir: 1 | -1): number {
  while (i >= 0 && i < values.length && Number.isNaN(values[i])) i += dir;
  return i >= 0 && i < values.length ? i : -1;
}

/**
 * MD at `depth` (TVDSS), the inverse of tvdssAt: linear between the valid
 * samples on either side of it; NaN outside them, never extrapolated, and
 * NaN without TVDSS. TVDSS increases over its valid samples (ADR-0002), so
 * they can be searched.
 */
export function mdAt(log: WellLog, depth: number): number {
  const { md, tvdss } = log;
  if (!tvdss) return NaN;
  let lo = validFrom(tvdss, 0, 1);
  let hi = validFrom(tvdss, tvdss.length - 1, -1);
  if (lo === -1 || !(depth >= tvdss[lo] && depth <= tvdss[hi])) return NaN;
  if (depth === tvdss[hi]) return md[hi];
  // tvdss[lo] <= depth < tvdss[hi], with lo and hi valid.
  for (;;) {
    const mid = (lo + hi) >> 1;
    let m = validFrom(tvdss, mid, -1);
    if (m <= lo) m = validFrom(tvdss, mid + 1, 1);
    if (m >= hi) break;
    if (tvdss[m] <= depth) lo = m;
    else hi = m;
  }
  return md[lo] + ((depth - tvdss[lo]) / (tvdss[hi] - tvdss[lo])) * (md[hi] - md[lo]);
}
