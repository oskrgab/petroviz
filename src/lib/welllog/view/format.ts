/**
 * Number formatting for the log view's headers.
 */

/** A curve scale end: up to 4 significant digits, no trailing zeros (0.2, 2000, -0.15). */
export function formatScaleEnd(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return String(Number(value.toPrecision(4)));
}
