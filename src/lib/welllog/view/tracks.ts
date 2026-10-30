/**
 * Names for tracks and fills in the track list panel, the track menu and the
 * fill editor (#56): what each shows in this well log, in words.
 */

import { formatScaleEnd } from "./format.ts";
import type { ResolvedEntry, ResolvedTrack } from "./kinds/index.ts";
import { entryLabel } from "./template/label.ts";
import type { Fill, FillBoundary } from "./template/types.ts";

const KIND_NAMES = { curve: "Curves", depth: "Depth", discrete: "Discrete", zone: "Zones" } as const;

const NOT_IN_WELL = "not in this well";

/**
 * A track's kind, and what it shows: a curve track's matched mnemonics, then
 * the entries that matched nothing; a depth track's reference; a discrete
 * track's curve; a zone track's zone set.
 */
export function trackSummary(resolved: ResolvedTrack): { kind: string; detail: string } {
  const kind = KIND_NAMES[resolved.kind];
  switch (resolved.kind) {
    case "curve": {
      if (resolved.entries.length === 0) return { kind, detail: "none yet" };
      const matched = resolved.entries.flatMap(({ curve }) => (curve ? [curve.mnemonic] : []));
      const unmatched = resolved.entries.flatMap(({ entry, curve }) => (curve ? [] : [entryLabel(entry)]));
      const parts = [...matched, ...(unmatched.length > 0 ? [`${NOT_IN_WELL}: ${unmatched.join(", ")}`] : [])];
      return { kind, detail: parts.join(" · ") };
    }
    case "depth": {
      const { ref } = resolved.track;
      if (ref === "active") return { kind, detail: "active depth reference" };
      const name = ref === "md" ? "MD" : "TVDSS";
      return { kind, detail: resolved.shown ? name : `${name} · not in this well log` };
    }
    case "discrete": {
      const [{ entry, curve }] = resolved.entries;
      return { kind, detail: curve ? curve.key : `${entryLabel(entry)} · ${NOT_IN_WELL}` };
    }
    case "zone":
      return { kind, detail: resolved.zoneSet ? resolved.track.zoneSet : `${resolved.track.zoneSet} · ${NOT_IN_WELL}` };
  }
}

/** One side of a fill: its curve's mnemonic (or what the entry looks for), its value, or its edge. */
export function boundaryLabel(boundary: FillBoundary, entries: readonly ResolvedEntry[]): string {
  switch (boundary.kind) {
    case "curve": {
      const resolved = entries.find((e) => e.entry.id === boundary.id);
      return resolved?.curve?.mnemonic ?? (resolved ? entryLabel(resolved.entry) : boundary.id);
    }
    case "value":
      return formatScaleEnd(boundary.value);
    case "edge":
      return `${boundary.edge} edge`;
  }
}

/** A fill, by its two sides. */
export function fillLabel(fill: Fill, entries: readonly ResolvedEntry[]): string {
  return `${boundaryLabel(fill.a, entries)} to ${boundaryLabel(fill.b, entries)}`;
}
