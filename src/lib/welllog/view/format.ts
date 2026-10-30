/**
 * Number formatting for the log view's headers and depth cursor readout,
 * and the text the curve editor and add-curve picker show.
 */

import type { ScaleEnds, ScaleType } from "./template/types.ts";

/** Shown where there is no value. */
export const NO_VALUE = "—";

/** Shown by every curve at the depth cursor inside a gap. */
export const GAP = "gap";

/** Whether a reading shows a value, rather than "gap", "—", or nothing at all. */
export function hasValue(reading: string | null | undefined): boolean {
  return reading != null && reading !== GAP && reading !== NO_VALUE;
}

/** 4 significant digits, without float noise or trailing zeros. */
const fourDigits = (value: number) => String(Number(value.toPrecision(4)));

/** A curve scale end: up to 4 significant digits, no trailing zeros (0.2, 2000, -0.15). */
export function formatScaleEnd(value: number): string {
  return Number.isFinite(value) ? fourDigits(value) : NO_VALUE;
}

/**
 * A curve value at the depth cursor, as recorded: 4 significant digits
 * without float noise, and whole from 1000 up, so an implausible 10011.3
 * reads 10011 rather than 1.001e+4.
 */
export function formatReading(value: number): string {
  if (!Number.isFinite(value)) return NO_VALUE;
  return Math.abs(value) >= 1000 ? value.toFixed(0) : fourDigits(value);
}

/** A depth, to 0.1 of its unit. */
export function formatDepth(depth: number): string {
  return Number.isFinite(depth) ? depth.toFixed(1) : NO_VALUE;
}

/** A whole %, but never 0% or 100% for a share that is neither. */
function formatShare(fraction: number): string {
  const percent = fraction * 100;
  if (percent > 0 && percent < 0.5) return "<1%";
  if (percent < 100 && percent >= 99.5) return ">99%";
  return `${Math.round(percent)}%`;
}

/** A curve's range in MD and the % missing inside it: "1234.6–3456.7 m · 12% missing". */
export function formatCoverage(coverage: { top: number; base: number; missing: number }, unit: string): string {
  return `${formatDepth(coverage.top)}–${formatDepth(coverage.base)} ${unit} · ${formatShare(coverage.missing)} missing`;
}

/** 1st, 2nd, 3rd, 4th, 11th, 12th, 21st… */
function ordinal(n: number): string {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${suffix}`;
}

/** How computed curve scale ends are worked out, for the curve editor; null for fixed ends. */
export function describeComputedEnds(ends: ScaleEnds, type: ScaleType): string | null {
  switch (ends.kind) {
    case "fixed":
      return null;
    case "percentile":
      return `Computed from the whole curve: ${ordinal(ends.lo)} to ${ordinal(ends.hi)} percentile`;
    case "centredOnMedian":
      return `Computed from the whole curve: ${ends.width} ${type === "log" ? "decades" : "wide"}, centred on its median`;
  }
}
