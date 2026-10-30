/**
 * Number formatting for the log view's headers and depth cursor readout.
 */

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
