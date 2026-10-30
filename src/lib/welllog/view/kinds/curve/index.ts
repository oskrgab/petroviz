/**
 * The curve track kind: one or more continuous curve entries, each on its own
 * curve scale, over gridlines from the track's first curve scale.
 */

import { log10Values } from "../../geometry/log10.ts";
import { scaleGridlines } from "../../geometry/grid.ts";
import { curvePolyline } from "../../geometry/polyline.ts";
import { mappingOf, type ResolvedScale } from "../../geometry/scale.ts";
import { DASHES, strokeDepthGrid, strokePolyline, strokeVerticalGrid } from "../../canvas.ts";
import { matchEntries } from "../../match.ts";
import type { CurveScale, CurveTrack } from "../../template/types.ts";
import type { ResolvedTrackBase, TrackKind } from "../types.ts";

export interface ResolvedCurveTrack extends ResolvedTrackBase<CurveTrack> {
  /** The track's first curve scale, matched or not, which its gridlines follow. */
  readonly grid: ResolvedScale | null;
}

/** Fixed ends are drawn as written. Unit conversion and computed ends come with #43. */
function resolveScale(scale: CurveScale): ResolvedScale {
  return { left: scale.ends.left, right: scale.ends.right, type: scale.type };
}

export const curveKind: TrackKind<CurveTrack, ResolvedCurveTrack> = {
  resolve(track, log) {
    const curves = matchEntries(track.curves, log.curves);
    const [first] = track.curves;
    return {
      kind: "curve",
      track,
      // Fixed ends need no curve, so even an empty track keeps its grid. #43's
      // computed ends will need the first matched curve instead.
      grid: first ? resolveScale(first.scale) : null,
      entries: track.curves.map((entry, i) => {
        const curve = curves[i];
        return { entry, curve, scale: curve ? resolveScale(entry.scale) : null };
      }),
    };
  },

  draw(ctx, resolved, { log, frame, dpr, tokens }) {
    if (resolved.grid) strokeVerticalGrid(ctx, scaleGridlines(resolved.grid), frame, dpr, tokens);
    strokeDepthGrid(ctx, frame, dpr, tokens);

    // Off-scale stretches run out of the track and are cut here, never pinned.
    // Colours are drawn as stored; adapting them on a dark track is #54.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, frame.width, frame.height);
    ctx.clip();
    ctx.lineJoin = "round";
    for (const { entry, curve, scale } of resolved.entries) {
      if (!curve || !scale) continue;
      const source = scale.type === "log" ? log10Values(curve.values) : curve.values;
      const { colour, width, dash } = entry.style;
      ctx.strokeStyle = colour;
      ctx.lineWidth = width * dpr;
      ctx.setLineDash(DASHES[dash].map((d) => d * width * dpr));
      strokePolyline(ctx, curvePolyline(log.md, source, mappingOf(scale), frame));
    }
    ctx.restore();
  },
};
