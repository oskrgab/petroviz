/**
 * welllog/core: the well log contract. Imports nothing (ADR-0004).
 */

export type { Curve, CurveKind, DepthUnit, HeaderItem, WellLog, Zone, ZoneSet } from "./wellLog.ts";
export { CURVE_FAMILIES, MNEMONIC_FAMILIES, curveFamilyOf, type CurveFamily } from "./families.ts";
export {
  LOAD_WARNING_CODES,
  isLoadWarningCode,
  severityOf,
  type LoadWarning,
  type LoadWarningCode,
  type Severity,
} from "./warnings.ts";
export { indexAtDepth, mdAt, tvdssAt, valueAt } from "./depth.ts";
export { checkWellLog, type Violation, type ViolationRule } from "./check.ts";
