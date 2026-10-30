/**
 * Short names for curve entries, for headers that have no curve to name.
 */

import type { CurveFamily } from "../../core/index.ts";
import { curveFamilyDefaults } from "./defaults.ts";
import type { CurveEntry, Selector } from "./types.ts";

/**
 * What an entry is looking for: its key, else its mnemonic, else its curve
 * family's short label (`SGR` for spectral gamma ray).
 */
export function entryLabel(entry: CurveEntry): string {
  const first = (by: Selector["by"]) => entry.select.find((s) => s.by === by)?.value;
  const family = first("family");
  return (
    first("key") ??
    first("mnemonic") ??
    (family && (curveFamilyDefaults[family as CurveFamily]?.label ?? family)) ??
    entry.id
  );
}
