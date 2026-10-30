/**
 * Matching a track's curve entries to a well log's curves (ADR-0003).
 *
 * - The first selector in an entry's list that matches a curve wins, and an
 *   entry shows at most one curve.
 * - `mnemonic` is case-insensitive; `mnemonic` and `family` take the first
 *   matching curve in well log order, so `GR` wins over `GR:2`.
 * - A `family` selector skips any curve another entry in the same track
 *   matches by key or mnemonic. Then `[mnemonic RXO, family micro]` and
 *   `[mnemonic RMIC, family micro]` draw RMIC once in a well without RXO.
 * - "Matches by key or mnemonic" means through a key or mnemonic selector
 *   ahead of the entry's first family selector. Those never depend on
 *   another entry, so the rule can't go circular. Every real list has that
 *   shape: `[key, mnemonic, family]`, `[mnemonic, family]` or `[family]`.
 * - Entries don't otherwise claim curves: two may show the same one.
 */

import type { Curve } from "../core/index.ts";
import type { Selector } from "./template/types.ts";

function matches(selector: Selector, curve: Curve): boolean {
  switch (selector.by) {
    case "key":
      return curve.key === selector.value;
    case "mnemonic":
      return curve.mnemonic.toUpperCase() === selector.value.toUpperCase();
    case "family":
      return curve.family === selector.value;
  }
}

/** Each entry's curve, or null where it matches nothing, in entry order. */
export function matchEntries(
  entries: readonly { readonly select: readonly Selector[] }[],
  curves: readonly Curve[],
): (Curve | null)[] {
  // Key and mnemonic selectors ahead of any family selector match the same
  // whatever the other entries do, so they settle first.
  const byName = entries.map((entry) => {
    for (const selector of entry.select) {
      if (selector.by === "family") return null;
      const curve = curves.find((c) => matches(selector, c));
      if (curve) return curve;
    }
    return null;
  });
  const named = new Set(byName.filter((curve) => curve !== null));

  return entries.map((entry, i) => {
    if (byName[i]) return byName[i];
    for (const selector of entry.select) {
      const curve = curves.find((c) => matches(selector, c) && !(selector.by === "family" && named.has(c)));
      if (curve) return curve;
    }
    return null;
  });
}
