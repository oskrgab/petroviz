/**
 * Value → position across a track, for linear, log and reversed curve scales.
 *
 * A position is a fraction of the track's width: 0 at the left end, 1 at the
 * right. It is never clamped, so an off-scale value lands outside [0, 1] and
 * the canvas cuts it at the track edge instead of pinning it there.
 */

import type { ScaleType } from "../template/types.ts";

/** A curve scale in the curve's own unit, ready to draw. */
export interface ResolvedScale {
  readonly left: number;
  readonly right: number;
  readonly type: ScaleType;
}

/**
 * fraction = a · source + b, where source is the value on a linear scale and
 * its log10 on a log scale (see log10Values). Precomputing a and b keeps the
 * per-sample work to one multiply-add.
 */
export interface Mapping {
  readonly a: number;
  readonly b: number;
}

export function mappingOf(scale: ResolvedScale): Mapping {
  const left = scale.type === "log" ? Math.log10(scale.left) : scale.left;
  const right = scale.type === "log" ? Math.log10(scale.right) : scale.right;
  const a = 1 / (right - left);
  return { a, b: -left * a };
}

/** The value's position across the track; NaN where a log scale can't place it. */
export function fractionOf(value: number, scale: ResolvedScale): number {
  const { a, b } = mappingOf(scale);
  const source = scale.type === "log" ? (value > 0 ? Math.log10(value) : NaN) : value;
  return a * source + b;
}
