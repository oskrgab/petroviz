/**
 * What a curve track's add-curve picker lists (#28, #55): the continuous
 * curves the current template doesn't display, with their count, then the
 * ones it does, which may be added again on another scale. A discrete curve
 * can't go in a curve track, so neither list has one.
 */

import type { Curve } from "../core/index.ts";
import type { ResolvedTemplate } from "./resolve.ts";

export interface PickerCurves {
  /** In well log order. */
  readonly notShown: readonly Curve[];
  readonly shown: readonly Curve[];
}

export function pickerCurves(resolved: ResolvedTemplate, curves: readonly Curve[]): PickerCurves {
  const unmatched = new Set(resolved.unmatchedCurves);
  const continuous = curves.filter((curve) => curve.kind === "continuous");
  return {
    notShown: continuous.filter((curve) => unmatched.has(curve)),
    shown: continuous.filter((curve) => !unmatched.has(curve)),
  };
}

/** "6 curves not shown", or that every curve is. */
export function notShownLabel(count: number): string {
  if (count === 0) return "Every curve is shown";
  return `${count} ${count === 1 ? "curve" : "curves"} not shown`;
}
