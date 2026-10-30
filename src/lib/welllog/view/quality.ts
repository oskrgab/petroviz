/**
 * What the log view marks because it may mislead the reader (#34, #51), and
 * nothing else: cautions on a curve, gaps, and a curve with no data in the
 * visible interval. Values themselves are never judged.
 */

import { severityOf, type LoadWarning, type WellLog } from "../core/index.ts";
import { firstRowAtOrBelow } from "./geometry/polyline.ts";
import type { DepthInterval } from "./interval.ts";

/**
 * The cautions that mark a curve, by curve key, in load order: those with a
 * curve key. Notes never mark a curve, and a caution without a curve key
 * shows only in the well panel.
 */
export function curveCautions(log: WellLog): Map<string, LoadWarning[]> {
  const byCurve = new Map<string, LoadWarning[]>();
  for (const warning of log.warnings) {
    if (warning.curveKey === undefined || severityOf(warning.code) !== "caution") continue;
    const cautions = byCurve.get(warning.curveKey) ?? [];
    cautions.push(warning);
    byCurve.set(warning.curveKey, cautions);
  }
  return byCurve;
}

/**
 * Every load warning on one curve, notes included, cautions first: what the
 * curve editor lists at its top.
 */
export function curveWarnings(log: WellLog, curveKey: string): LoadWarning[] {
  const own = log.warnings.filter((w) => w.curveKey === curveKey);
  return [...own.filter((w) => severityOf(w.code) === "caution"), ...own.filter((w) => severityOf(w.code) === "note")];
}

/** Whether no curve, continuous or discrete, has a value in the row. */
export function isGapRow(log: WellLog, row: number): boolean {
  return row >= 0 && row < log.md.length && log.curves.every((curve) => Number.isNaN(curve.values[row]));
}

const gaps = new WeakMap<WellLog, readonly DepthInterval[]>();

/**
 * The well log's gaps, in MD, found from its gap rows and never from step
 * sizes. A row stands for the interval down to the next row's MD, as at the
 * depth cursor, so a gap runs from its first gap row's MD to the MD of the
 * first row after it; that is where a lithology block or zone resumes. A gap
 * on the last row has no thickness. Found once per well log.
 */
export function gapsOf(log: WellLog): readonly DepthInterval[] {
  let found = gaps.get(log);
  if (found) return found;
  const { md } = log;
  const bands: DepthInterval[] = [];
  let start = -1;
  for (let i = 0; i <= md.length; i++) {
    const gap = i < md.length && isGapRow(log, i);
    if (gap && start < 0) start = i;
    if (gap || start < 0) continue;
    bands.push({ top: md[start], base: md[Math.min(i, md.length - 1)] });
    start = -1;
  }
  found = bands;
  gaps.set(log, found);
  return found;
}

/**
 * Whether a curve has data in the interval: a value at a row inside it, or a
 * line crossing it between the rows on either side. False is a scale bar's
 * "no data in view".
 */
export function hasValueIn(md: Float64Array, values: Float32Array, interval: DepthInterval): boolean {
  const start = firstRowAtOrBelow(md, interval.top);
  let end = start;
  for (; end < md.length && md[end] <= interval.base; end++) {
    if (!Number.isNaN(values[end])) return true;
  }
  if (end > start || start === 0 || end === md.length) return false;
  // No row inside: a line from the row above to the row below crosses it.
  return !Number.isNaN(values[start - 1]) && !Number.isNaN(values[end]);
}

/** Where a curve has values, for the curve editor and the add-curve picker (#34). */
export interface Coverage {
  /** The MD of its first value and of its last. */
  readonly top: number;
  readonly base: number;
  /** The share of [top, base], by depth, where it has no value: 0–1. */
  readonly missing: number;
}

/**
 * A curve's range, from its first value to its last, and how much of it is
 * missing. As in gapsOf, a row stands for the interval down to the next
 * row's MD, so a row without a value counts for all of that interval, however
 * long. Null for a curve with no value, which a well log never holds.
 */
export function curveCoverage(md: Float64Array, values: Float32Array): Coverage | null {
  let first = 0;
  while (first < values.length && Number.isNaN(values[first])) first++;
  if (first === values.length) return null;
  let last = values.length - 1;
  while (Number.isNaN(values[last])) last--;
  let missing = 0;
  for (let i = first; i < last; i++) {
    if (Number.isNaN(values[i])) missing += md[i + 1] - md[i];
  }
  const span = md[last] - md[first];
  return { top: md[first], base: md[last], missing: span > 0 ? missing / span : 0 };
}
