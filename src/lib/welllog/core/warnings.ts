/**
 * Load warnings: the closed set of codes an adapter may attach to a well log,
 * each with its fixed severity (ADR-0002, #34).
 *
 * A note means nothing was lost. A caution means data was dropped or the
 * adapter assumed something, so what is drawn may not match the source.
 */

export type Severity = "note" | "caution";

const SEVERITY = {
  "sentinel-replaced": "note",
  "duplicate-mnemonic-renamed": "note",
  "gap-inserted": "note",
  "depth-sorted": "note",
  "step-mismatch": "note",
  "curve-empty": "note",
  "duplicate-depth-dropped": "caution",
  "row-dropped": "caution",
  "curves-dropped": "caution",
  "columns-ignored": "caution",
  "depth-unit-assumed": "caution",
  "version-assumed": "caution",
  "tvdss-not-monotonic": "caution",
  "discrete-read-as-continuous": "caution",
  "value-unreadable": "caution",
} as const satisfies Record<string, Severity>;

export type LoadWarningCode = keyof typeof SEVERITY;

export const LOAD_WARNING_CODES = Object.keys(SEVERITY) as readonly LoadWarningCode[];

export interface LoadWarning {
  readonly code: LoadWarningCode;
  /** The curve it concerns, for the per-curve codes. */
  readonly curveKey?: string;
  /** How many samples, rows or values it covers, where that means something. */
  readonly count?: number;
  readonly message: string;
}

export function severityOf(code: LoadWarningCode): Severity {
  return SEVERITY[code];
}

export function isLoadWarningCode(code: string): code is LoadWarningCode {
  return Object.hasOwn(SEVERITY, code);
}
