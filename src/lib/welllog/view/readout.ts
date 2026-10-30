/**
 * The depth cursor's readout (#47): what every track reads at one depth, for
 * the headers, and the floating card's rows.
 *
 * A row stands for the interval from its MD down to the next row's (core's
 * indexAtDepth), so the cursor anywhere in that interval reads that row.
 * Inside a gap, where no curve has a value, curves and lithology read "gap";
 * where only one curve lacks a value, it reads "—" (#34). Values are read as
 * recorded, off-scale or implausible.
 */

import { indexAtDepth, tvdssAt, type WellLog } from "../core/index.ts";
import { formatDepth } from "./format.ts";
import type { DepthRef } from "./interval.ts";
import { codeLabelAt, discreteCurveName } from "./kinds/discrete/index.ts";
import { readTrack, type ResolvedTrack, type TrackReading } from "./kinds/index.ts";
import { zoneNameAt } from "./kinds/zone/index.ts";
import { isGapRow } from "./quality.ts";

export interface CursorReadout {
  readonly md: number;
  /** NaN where the well log has no TVDSS at `md`. */
  readonly tvdss: number;
  /** Whether `md` lies in a gap. */
  readonly gap: boolean;
  /** Each track's reading, by track id. */
  readonly tracks: ReadonlyMap<string, TrackReading>;
}

/** What every track reads at `md`, against the depth reference the view shows. */
export function readoutAt(log: WellLog, tracks: readonly ResolvedTrack[], md: number, depthRef: DepthRef): CursorReadout {
  const at = { log, md, tvdss: tvdssAt(log, md), gap: isGapRow(log, indexAtDepth(log, md)), depthRef };
  return {
    md,
    tvdss: at.tvdss,
    gap: at.gap,
    tracks: new Map(tracks.map((resolved) => [resolved.track.id, readTrack(resolved, at)])),
  };
}

/** One line of the floating card. */
export interface CardRow {
  readonly label: string;
  readonly value: string;
  readonly unit?: string;
  /** The curve's stored colour, for its mnemonic. */
  readonly colour?: string;
}

/**
 * The floating card's rows, in groups: MD and TVDSS (when the well log has
 * it); every displayed curve, a group per curve track; the well log's
 * discrete curves, such as lithology; and its zone sets. Discrete curves and
 * zone sets come from the well log, shown in a track or not. Empty groups
 * are left out.
 */
export function cardGroups(log: WellLog, tracks: readonly ResolvedTrack[], readout: CursorReadout): CardRow[][] {
  const { md, gap } = readout;
  const unit = log.depthUnit;
  const depths: CardRow[] = [{ label: "MD", value: formatDepth(md), unit }];
  if (log.tvdss) depths.push({ label: "TVDSS", value: formatDepth(readout.tvdss), unit });

  const curves = tracks.map((resolved): CardRow[] => {
    if (resolved.kind !== "curve") return [];
    const reading = readout.tracks.get(resolved.track.id) ?? [];
    return resolved.entries.flatMap(({ entry, curve }, i) =>
      curve && reading[i] ? [{ label: curve.mnemonic, value: reading[i], unit: curve.unit, colour: entry.style.colour }] : [],
    );
  });

  const discretes = log.curves
    .filter((curve) => curve.kind === "discrete")
    .map((curve): CardRow => ({ label: discreteCurveName(curve), value: codeLabelAt(log, curve, md, gap) }));

  const zones = log.zoneSets.map(({ name, zones }): CardRow => ({ label: name, value: zoneNameAt(zones, md) }));

  return [depths, ...curves, discretes, zones].filter((group) => group.length > 0);
}
