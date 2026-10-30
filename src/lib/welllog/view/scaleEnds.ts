/**
 * A curve entry's scale against the curve it matched (#29, #43): fixed ends
 * converted into the curve's unit, or ends computed from the curve's values
 * over the whole well, never over the visible interval, so curve scales
 * don't move as the view does.
 */

import type { Curve } from "../core/index.ts";
import { scaleSource } from "./geometry/log10.ts";
import type { ResolvedScale } from "./geometry/scale.ts";
import type { CurveScale, ScaleType } from "./template/types.ts";
import { conversionFactor } from "./units.ts";

/** Where fixed ends with no known conversion fall back. */
export const FALLBACK_PERCENTILES = { lo: 1, hi: 99 } as const;

const sortedCache = new WeakMap<Float32Array, Float32Array>();

/** The finite values, ascending; computed once per values array. */
function sortedFinite(values: Float32Array): Float32Array {
  let sorted = sortedCache.get(values);
  if (!sorted) {
    sorted = values.filter(Number.isFinite).sort();
    sortedCache.set(values, sorted);
  }
  return sorted;
}

/** The p-th percentile (0–100), interpolating between the closest ranks. */
function percentile(sorted: Float32Array, p: number): number {
  if (sorted.length === 0) return NaN;
  const h = ((sorted.length - 1) * Math.min(100, Math.max(0, p))) / 100;
  const i = Math.floor(h);
  const next = sorted[Math.min(i + 1, sorted.length - 1)];
  return sorted[i] + (h - i) * (next - sorted[i]);
}

/** The finite values a scale works on (log10 on a log scale), ascending. */
function sortedSource(curve: Curve, type: ScaleType): Float32Array {
  return sortedFinite(scaleSource(curve.values, type));
}

/**
 * Ends computed in source space (log10 on a log scale) back in values, in
 * the scale's direction. Ends that coincide are spread apart, so a constant
 * curve still has a scale to sit in; a curve with no values gets [0, 1]
 * (10⁰ to 10¹ on a log scale).
 */
function scaleFromSourceEnds(a: number, b: number, type: ScaleType, reversed: boolean): ResolvedScale {
  let [lo, hi] = Number.isFinite(a) && Number.isFinite(b) ? [Math.min(a, b), Math.max(a, b)] : [0, 1];
  if (hi <= lo) {
    const half = type === "log" ? 0.5 : Math.abs(lo) * 0.05 || 0.5;
    [lo, hi] = [lo - half, hi + half];
  }
  const value = (s: number) => (type === "log" ? 10 ** s : s);
  const [left, right] = reversed ? [hi, lo] : [lo, hi];
  return { left: value(left), right: value(right), type };
}

export function resolveScale(scale: CurveScale, curve: Curve): ResolvedScale {
  const { type, ends } = scale;
  switch (ends.kind) {
    case "fixed": {
      const factor = conversionFactor(ends.unit, curve.unit);
      if (factor !== null) return { left: ends.left * factor, right: ends.right * factor, type };
      const sorted = sortedSource(curve, type);
      const { lo, hi } = FALLBACK_PERCENTILES;
      return scaleFromSourceEnds(percentile(sorted, lo), percentile(sorted, hi), type, ends.left > ends.right);
    }
    case "centredOnMedian": {
      const median = percentile(sortedSource(curve, type), 50);
      return scaleFromSourceEnds(median - ends.width / 2, median + ends.width / 2, type, ends.reversed);
    }
    case "percentile": {
      const sorted = sortedSource(curve, type);
      return scaleFromSourceEnds(percentile(sorted, ends.lo), percentile(sorted, ends.hi), type, ends.reversed);
    }
  }
}
