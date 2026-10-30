/**
 * The depth track kind: depths of the active depth reference, or of a fixed
 * `md` or `tvdss`, labelled down the track over the well log's gaps,
 * hatched. A fixed `tvdss` track on a well log without TVDSS keeps its
 * place, greyed, with an empty body.
 *
 * A track showing the view's own axis labels its round depths. One showing
 * the other reference (MD beside a TVDSS view, or TVDSS beside an MD one)
 * labels the rows where that reference crosses a round depth, at each row's
 * place on the axis.
 */

import { tvdssAt } from "../../../core/index.ts";
import { hasTvdss, intervalOnAxis, toMd } from "../../axis.ts";
import { intervalSpans } from "../../geometry/blocks.ts";
import { depthStep, depthsEvery } from "../../geometry/grid.ts";
import { pixelsPerUnit, visibleRows } from "../../geometry/polyline.ts";
import { crisp, hairline, hatchGaps } from "../../canvas.ts";
import { formatDepth } from "../../format.ts";
import type { DepthRef } from "../../interval.ts";
import { gapsOf } from "../../quality.ts";
import type { DepthTrack } from "../../template/types.ts";
import type { ResolvedTrackBase, TrackKind } from "../types.ts";

export interface ResolvedDepthTrack extends ResolvedTrackBase<DepthTrack> {
  /**
   * Whether the well log has the depth reference the track shows. Only a
   * fixed `tvdss` track can lack it: the active one falls back on MD.
   */
  readonly shown: boolean;
}

/** The depth reference a depth track shows: its fixed one, or the view's. */
export function depthTrackRef(track: DepthTrack, viewRef: DepthRef): DepthRef {
  return track.ref === "active" ? viewRef : track.ref;
}

/** Labels sit at least this many CSS px apart. */
const LABEL_SPACING = 40;

export const depthKind: TrackKind<DepthTrack, ResolvedDepthTrack> = {
  resolve(track, log) {
    return { kind: "depth", track, entries: [], shown: track.ref !== "tvdss" || hasTvdss(log) };
  },

  read(resolved, { md, tvdss, depthRef }) {
    return [formatDepth(depthTrackRef(resolved.track, depthRef) === "md" ? md : tvdss)];
  },

  draw(ctx, resolved, { log, axis, frame, dpr, tokens }) {
    if (!resolved.shown) return;
    const ref = depthTrackRef(resolved.track, axis.ref);
    const k = pixelsPerUnit(frame);
    const tick = 5 * dpr;
    const margin = 7 * dpr;

    hatchGaps(ctx, intervalSpans(gapsOf(log).map((gap) => intervalOnAxis(axis, gap)), frame), frame, dpr, tokens.gapHatch);

    ctx.strokeStyle = tokens.gridMajor;
    ctx.fillStyle = tokens.text;
    ctx.lineWidth = hairline(dpr);
    ctx.font = `${11 * dpr}px ${tokens.font}`;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";

    const label = (axisDepth: number, depth: number, step: number) => {
      const y = crisp((axisDepth - frame.top) * k, dpr);
      if (!(y >= margin && y <= frame.height - margin)) return;
      ctx.beginPath();
      ctx.moveTo(frame.width - tick, y);
      ctx.lineTo(frame.width, y);
      ctx.stroke();
      ctx.fillText(depth.toFixed(step < 1 ? 1 : 0), frame.width - margin, y);
    };

    if (ref === axis.ref) {
      const step = depthStep(k / dpr, LABEL_SPACING);
      for (const depth of depthsEvery(step, frame.top, frame.base)) label(depth, depth, step);
      return;
    }

    // The other reference: its step from its own span over the view, and a
    // label where a row crosses a round depth. A row without it breaks the
    // run, so no label straddles it.
    const values = ref === "md" ? log.md : log.tvdss;
    if (!values) return;
    const refAt = (axisDepth: number) => {
      const md = toMd(axis, axisDepth);
      return ref === "md" ? md : tvdssAt(log, md);
    };
    const span = refAt(frame.base) - refAt(frame.top);
    const step = depthStep((span > 0 ? frame.height / span : k) / dpr, LABEL_SPACING);
    const [start, end] = visibleRows(axis.depths, frame);
    let previous = NaN;
    for (let i = start; i < end; i++) {
      const band = Math.floor(values[i] / step);
      if (Number.isFinite(band) && Number.isFinite(previous) && band !== previous) label(axis.depths[i], band * step, step);
      previous = band;
    }
  },
};
