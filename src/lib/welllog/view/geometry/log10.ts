/**
 * log10 buffers for curves on a log scale, computed once per curve per well
 * log. Keyed on the curve's `values` array, so they last across template
 * edits and go when the well log does.
 */

import type { ScaleType } from "../template/types.ts";

const cache = new WeakMap<Float32Array, Float32Array>();

/** log10 of each value; NaN where the value is missing or not positive. */
export function log10Values(values: Float32Array): Float32Array {
  let logs = cache.get(values);
  if (!logs) {
    logs = new Float32Array(values.length);
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      logs[i] = v > 0 ? Math.log10(v) : NaN;
    }
    cache.set(values, logs);
  }
  return logs;
}

/** What a curve scale works on: the values, or their log10 on a log scale. */
export function scaleSource(values: Float32Array, type: ScaleType): Float32Array {
  return type === "log" ? log10Values(values) : values;
}
