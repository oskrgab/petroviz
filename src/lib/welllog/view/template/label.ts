/**
 * Short names for curve entries, for headers that have no curve to name.
 */

import type { CurveFamily } from "../../core/index.ts";
import { curveFamilyDefaults, discreteFamilyDefaults, type ContinuousFamily } from "./defaults.ts";
import type { Entry, Selector } from "./types.ts";

/**
 * What an entry is looking for: its key, else its mnemonic, else its curve
 * family's short label (`SGR` for spectral gamma ray).
 */
export function entryLabel(entry: Entry): string {
  const first = (by: Selector["by"]) => entry.select.find((s) => s.by === by)?.value;
  const family = first("family");
  return (
    first("key") ??
    first("mnemonic") ??
    (family && familyLabel(family)) ??
    entry.id
  );
}

/** A curve family's short label, or its id when it has none. */
export function familyLabel(family: string): string {
  const name = family as CurveFamily;
  return curveFamilyDefaults[name as ContinuousFamily]?.label ?? discreteFamilyDefaults[name]?.label ?? family;
}
