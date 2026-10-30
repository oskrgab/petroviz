/**
 * The curve track kind: one or more continuous curve entries, each on its own
 * curve scale (see scaleEnds.ts), over gridlines from the track's first
 * curve scale.
 */

import { scaleSource } from "../../geometry/log10.ts";
import { scaleGridlines } from "../../geometry/grid.ts";
import { curvePolyline, wrappedPolyline } from "../../geometry/polyline.ts";
import { mappingOf, type ResolvedScale } from "../../geometry/scale.ts";
import { DASHES, strokeDepthGrid, strokePolyline, strokeVerticalGrid } from "../../canvas.ts";
import { matchEntries } from "../../match.ts";
import { resolveScale } from "../../scaleEnds.ts";
import type { CurveTrack } from "../../template/types.ts";
import type { ResolvedEntry, ResolvedTrackBase, TrackKind } from "../types.ts";

/** Wrapped segments are drawn lighter than the curve, so they can't be read as on-scale. */
const WRAPPED_ALPHA = 0.45;

export interface ResolvedCurveTrack extends ResolvedTrackBase<CurveTrack, ResolvedEntry> {
  /** The track's first curve scale, matched or not, which its gridlines follow. */
  readonly grid: ResolvedScale | null;
}

/**
 * The scale the gridlines follow: the first entry's, matched or not, so an
 * empty track keeps its grid. Unmatched, fixed ends are taken as written;
 * computed ends need a curve, so a linear track keeps its even divisions
 * and a log track has none.
 */
function gridScale(first: ResolvedEntry | undefined): ResolvedScale | null {
  if (!first) return null;
  if (first.scale) return first.scale;
  const { type, ends } = first.entry.scale;
  if (ends.kind === "fixed") return { left: ends.left, right: ends.right, type };
  return type === "linear" ? { left: 0, right: 1, type } : null;
}

export const curveKind: TrackKind<CurveTrack, ResolvedCurveTrack> = {
  resolve(track, log) {
    const curves = matchEntries(track.curves, log.curves.filter((c) => c.kind === "continuous"));
    const entries = track.curves.map((entry, i): ResolvedEntry => {
      const curve = curves[i];
      return { entry, curve, scale: curve ? resolveScale(entry.scale, curve) : null };
    });
    return { kind: "curve", track, grid: gridScale(entries[0]), entries };
  },

  draw(ctx, resolved, { log, frame, dpr, tokens }) {
    if (resolved.grid) strokeVerticalGrid(ctx, scaleGridlines(resolved.grid), frame, dpr, tokens);
    strokeDepthGrid(ctx, frame, dpr, tokens);

    // Off-scale stretches run out of the track and are cut here, never pinned;
    // a wrap entry draws them again, shifted back, lighter. Colours are drawn
    // as stored; adapting them on a dark track is #54.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, frame.width, frame.height);
    ctx.clip();
    ctx.lineJoin = "round";
    for (const { entry, curve, scale } of resolved.entries) {
      if (!curve || !scale) continue;
      const source = scaleSource(curve.values, scale.type);
      const mapping = mappingOf(scale);
      const { colour, width, dash } = entry.style;
      const inset = (width * dpr) / 2;
      ctx.strokeStyle = colour;
      ctx.lineWidth = width * dpr;
      ctx.setLineDash(DASHES[dash].map((d) => d * width * dpr));
      strokePolyline(ctx, curvePolyline(log.md, source, mapping, frame, inset));
      if (entry.offScale === "wrap") {
        ctx.globalAlpha = WRAPPED_ALPHA;
        strokePolyline(ctx, wrappedPolyline(log.md, source, mapping, frame, inset));
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
  },
};
