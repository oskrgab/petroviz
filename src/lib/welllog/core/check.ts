/**
 * checkWellLog: every way a well log breaks the contract (ADR-0002).
 *
 * Adapter tests run it on everything they build, so the contract is checked
 * against every source.
 */

import { isLoadWarningCode } from "./warnings.ts";
import type { WellLog } from "./wellLog.ts";

export type ViolationRule =
  | "no-rows"
  | "md-not-increasing"
  | "length-mismatch"
  | "tvdss-not-increasing"
  | "curve-empty"
  | "duplicate-key"
  | "discrete-not-integer"
  | "zone-order"
  | "unknown-warning-code"
  | "warning-unknown-curve"
  | "depth-unit";

export interface Violation {
  readonly rule: ViolationRule;
  readonly message: string;
}

/** Every violation in the well log, in a stable order; empty when it is sound. */
export function checkWellLog(log: WellLog): Violation[] {
  const violations: Violation[] = [];
  const add = (rule: ViolationRule, message: string) => violations.push({ rule, message });
  const n = log.md.length;

  if (log.depthUnit !== "m" && log.depthUnit !== "ft") {
    add("depth-unit", `Depth unit is "${log.depthUnit}", not m or ft`);
  }

  if (n === 0) {
    add("no-rows", "MD has no rows");
  }
  for (let i = 0; i < n; i++) {
    const ok = Number.isFinite(log.md[i]) && (i === 0 || log.md[i] > log.md[i - 1]);
    if (!ok) {
      add("md-not-increasing", `MD is not strictly increasing at row ${i} (${log.md[i]})`);
      break;
    }
  }

  if (log.tvdss) {
    if (log.tvdss.length !== n) {
      add("length-mismatch", `TVDSS has ${log.tvdss.length} rows, MD has ${n}`);
    } else {
      let previous = -Infinity;
      for (let i = 0; i < n; i++) {
        const t = log.tvdss[i];
        if (Number.isNaN(t)) continue;
        if (!(t > previous)) {
          add("tvdss-not-increasing", `TVDSS is not strictly increasing at row ${i} (${t})`);
          break;
        }
        previous = t;
      }
    }
  }

  const keys = new Set<string>();
  for (const curve of log.curves) {
    if (keys.has(curve.key)) add("duplicate-key", `Two curves have the key ${curve.key}`);
    keys.add(curve.key);

    if (curve.values.length !== n) {
      add("length-mismatch", `${curve.key} has ${curve.values.length} rows, MD has ${n}`);
      continue;
    }
    if (!curve.values.some((v) => !Number.isNaN(v))) {
      add("curve-empty", `${curve.key} has no value`);
    }
    if (curve.kind === "discrete" && curve.values.some((v) => !Number.isNaN(v) && !Number.isInteger(v))) {
      add("discrete-not-integer", `${curve.key} is discrete but holds a non-integer code`);
    }
  }

  for (const set of log.zoneSets) {
    let previousBase = -Infinity;
    for (const zone of set.zones) {
      if (!(zone.top <= zone.base && zone.top >= previousBase)) {
        add("zone-order", `Zone set ${set.name}: ${zone.name} (${zone.top}–${zone.base}) is out of order`);
        break;
      }
      previousBase = zone.base;
    }
  }

  for (const warning of log.warnings) {
    if (!isLoadWarningCode(warning.code)) {
      add("unknown-warning-code", `Unknown load warning code ${warning.code}`);
    } else if (warning.curveKey !== undefined && !keys.has(warning.curveKey)) {
      add("warning-unknown-curve", `Load warning ${warning.code} names ${warning.curveKey}, which isn't a curve`);
    }
  }

  return violations;
}
