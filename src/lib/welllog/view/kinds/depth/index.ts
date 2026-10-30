/**
 * The depth track kind: round depths of the active depth reference, or of a
 * fixed `md` or `tvdss`, labelled down the track.
 */

import { depthStep, depthsEvery } from "../../geometry/grid.ts";
import { pixelsPerUnit, visibleRows } from "../../geometry/polyline.ts";
import { crisp, hairline } from "../../canvas.ts";
import type { DepthRef } from "../../interval.ts";
import type { DepthTrack } from "../../template/types.ts";
import type { ResolvedTrackBase, TrackKind } from "../types.ts";

export type ResolvedDepthTrack = ResolvedTrackBase<DepthTrack>;

/** The depth reference a depth track shows: its fixed one, or the view's. */
export function depthTrackRef(track: DepthTrack, viewRef: DepthRef): DepthRef {
  return track.ref === "active" ? viewRef : track.ref;
}

/** Labels sit at least this many CSS px apart. */
const LABEL_SPACING = 40;

export const depthKind: TrackKind<DepthTrack, ResolvedDepthTrack> = {
  resolve(track) {
    return { kind: "depth", track, entries: [] };
  },

  draw(ctx, resolved, { log, frame, dpr, tokens, depthRef }) {
    const k = pixelsPerUnit(frame);
    const step = depthStep(k / dpr, LABEL_SPACING);
    const decimals = step < 1 ? 1 : 0;
    const tick = 5 * dpr;
    const margin = 7 * dpr;

    ctx.strokeStyle = tokens.gridMajor;
    ctx.fillStyle = tokens.text;
    ctx.lineWidth = hairline(dpr);
    ctx.font = `${11 * dpr}px ${tokens.font}`;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";

    const label = (md: number, depth: number) => {
      const y = crisp((md - frame.top) * k, dpr);
      if (y < margin || y > frame.height - margin) return;
      ctx.beginPath();
      ctx.moveTo(frame.width - tick, y);
      ctx.lineTo(frame.width, y);
      ctx.stroke();
      ctx.fillText(depth.toFixed(decimals), frame.width - margin, y);
    };

    if (depthTrackRef(resolved.track, depthRef) === "md") {
      for (const md of depthsEvery(step, frame.top, frame.base)) label(md, md);
      return;
    }
    // TVDSS: a label where it crosses a round depth, at that row's MD.
    const { tvdss, md } = log;
    if (!tvdss) return;
    const [start, end] = visibleRows(md, frame);
    let previous = NaN;
    for (let i = start; i < end; i++) {
      const band = Math.floor(tvdss[i] / step);
      if (Number.isFinite(previous) && band !== previous) label(md[i], band * step);
      previous = band;
    }
  },
};
