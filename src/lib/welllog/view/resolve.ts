/**
 * resolveTemplate: the current template against one well log (ADR-0003,
 * #31). Everything that draws reads this and the well log, and nothing else.
 * It is derived, never stored, so a template edit or a new well simply
 * resolves again.
 */

import type { Curve, WellLog } from "../core/index.ts";
import { resolveTrack, type ResolvedTrack } from "./kinds/index.ts";
import type { Entry, Template } from "./template/types.ts";

export interface ResolvedTemplate {
  /** One per template track, in display order: matched curves and curve scales. */
  readonly tracks: readonly ResolvedTrack[];
  /** Entries that match nothing in this well log, with their track. */
  readonly unmatchedEntries: readonly { readonly trackId: string; readonly entry: Entry }[];
  /** Zone tracks whose zone set this well log lacks; each keeps its place. */
  readonly unmatchedZoneSets: readonly { readonly trackId: string; readonly zoneSet: string }[];
  /** The well log's curves no entry shows, in well log order. */
  readonly unmatchedCurves: readonly Curve[];
}

export function resolveTemplate(template: Template, log: WellLog): ResolvedTemplate {
  const tracks = template.tracks.map((track) => resolveTrack(track, log));
  const shown = new Set<Curve>();
  const unmatchedEntries: { trackId: string; entry: Entry }[] = [];
  const unmatchedZoneSets: { trackId: string; zoneSet: string }[] = [];
  for (const resolved of tracks) {
    for (const { entry, curve } of resolved.entries) {
      if (curve) shown.add(curve);
      else unmatchedEntries.push({ trackId: resolved.track.id, entry });
    }
    if (resolved.kind === "zone" && !resolved.zoneSet) {
      unmatchedZoneSets.push({ trackId: resolved.track.id, zoneSet: resolved.track.zoneSet });
    }
  }
  return {
    tracks,
    unmatchedEntries,
    unmatchedZoneSets,
    unmatchedCurves: log.curves.filter((curve) => !shown.has(curve)),
  };
}
