/**
 * The zone track kind: one zone set, matched by name. Each zone is a block
 * of opaque categorical colour with its name, split from the next by a line
 * in --welllog-zone-line. A hovered zone gets an inset outline in
 * --welllog-text, since an opaque fill leaves no room for a hover tint.
 */

import type { Zone, ZoneSet } from "../../../core/index.ts";
import { crisp, hairline } from "../../canvas.ts";
import { zoneColours } from "../../colour/categorical.ts";
import { labelColour } from "../../colour/contrast.ts";
import { NO_VALUE } from "../../format.ts";
import { pixelsPerUnit } from "../../geometry/polyline.ts";
import type { ZoneTrack } from "../../template/types.ts";
import type { ResolvedTrackBase, TrackKind } from "../types.ts";

export interface ResolvedZoneTrack extends ResolvedTrackBase<ZoneTrack> {
  /** Null when the well log has no zone set of that name. */
  readonly zoneSet: ZoneSet | null;
  /** Per zone, in order: its fill, and the ink its name is written in. */
  readonly colours: readonly string[];
  readonly labelInks: readonly string[];
}

/** The index of the zone holding `md` (top inclusive, base exclusive), or null. */
export function zoneAt(zones: readonly Zone[], md: number): number | null {
  const i = zones.findIndex((z) => z.top <= md && md < z.base);
  return i === -1 ? null : i;
}

/** The name of the zone holding `md`, or "—". */
export function zoneNameAt(zones: readonly Zone[], md: number): string {
  const i = zoneAt(zones, md);
  return i === null ? NO_VALUE : zones[i].name;
}

/** A label is drawn only in a zone at least this many CSS px tall. */
const MIN_LABEL_HEIGHT = 14;

export const zoneKind: TrackKind<ZoneTrack, ResolvedZoneTrack> = {
  resolve(track, log) {
    const zoneSet = log.zoneSets.find((set) => set.name === track.zoneSet) ?? null;
    const colours = zoneSet ? zoneColours(zoneSet.zones, track.colours) : [];
    return { kind: "zone", track, entries: [], zoneSet, colours, labelInks: colours.map(labelColour) };
  },

  hit(resolved, md) {
    return resolved.zoneSet ? zoneAt(resolved.zoneSet.zones, md) : null;
  },

  /** The zone's name; a gap doesn't break a zone, so it reads there too. */
  read(resolved, { md }) {
    return [resolved.zoneSet ? zoneNameAt(resolved.zoneSet.zones, md) : null];
  },

  draw(ctx, resolved, { frame, dpr, tokens, hovered }) {
    if (!resolved.zoneSet) return;
    const k = pixelsPerUnit(frame);
    const y = (md: number) => (md - frame.top) * k;
    const visible = resolved.zoneSet.zones
      .map((zone, i) => ({ zone, i, y0: y(zone.top), y1: y(zone.base) }))
      .filter(({ y0, y1 }) => y1 > 0 && y0 < frame.height);

    for (const { i, y0, y1 } of visible) {
      ctx.fillStyle = resolved.colours[i];
      ctx.fillRect(0, y0, frame.width, y1 - y0);
    }

    ctx.strokeStyle = tokens.zoneLine;
    ctx.lineWidth = hairline(dpr);
    ctx.beginPath();
    for (const { y0, y1 } of visible) {
      for (const edge of [y0, y1]) {
        const at = crisp(edge, dpr);
        ctx.moveTo(0, at);
        ctx.lineTo(frame.width, at);
      }
    }
    ctx.stroke();

    ctx.font = `${10.5 * dpr}px ${tokens.font}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const pad = 4 * dpr;
    for (const { zone, i, y0, y1 } of visible) {
      if (y1 - y0 < MIN_LABEL_HEIGHT * dpr) continue;
      // Centred on the zone's visible part, kept inside the zone.
      const half = 8 * dpr;
      const mid = (Math.max(y0, 0) + Math.min(y1, frame.height)) / 2;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, y0, frame.width, y1 - y0);
      ctx.clip();
      ctx.fillStyle = resolved.labelInks[i];
      ctx.fillText(zone.name, pad, Math.min(Math.max(mid, y0 + half), y1 - half));
      ctx.restore();
    }

    const hover = visible.find(({ i }) => i === hovered);
    if (hover) {
      const w = 2 * dpr;
      ctx.strokeStyle = tokens.text;
      ctx.lineWidth = w;
      ctx.strokeRect(w / 2, hover.y0 + w / 2, frame.width - w, hover.y1 - hover.y0 - w);
    }
  },
};
