/**
 * The curve track kind: one or more continuous curve entries, each on its own
 * curve scale (see scaleEnds.ts), over its fills and gridlines from the
 * track's first curve scale.
 */

import { valueAt, type Curve } from "../../../core/index.ts";
import { fillPolygons, type BoundaryPlacement } from "../../geometry/fill.ts";
import { scaleSource } from "../../geometry/log10.ts";
import { scaleGridlines } from "../../geometry/grid.ts";
import { curvePolyline, wrappedPolyline } from "../../geometry/polyline.ts";
import { fractionOf, mappingOf, type ResolvedScale } from "../../geometry/scale.ts";
import { DASHES, fillPolygonPaths, strokeDepthGrid, strokePolyline, strokeVerticalGrid } from "../../canvas.ts";
import { adaptFill, adaptStroke } from "../../colour/adapt.ts";
import { GAP, formatReading } from "../../format.ts";
import { matchEntries } from "../../match.ts";
import { resolveScale } from "../../scaleEnds.ts";
import type { CurveTrack, Fill, FillBoundary } from "../../template/types.ts";
import type { ResolvedEntry, ResolvedTrackBase, TrackKind } from "../types.ts";

/** Wrapped segments are drawn lighter than the curve, so they can't be read as on-scale. */
const WRAPPED_ALPHA = 0.45;

/** A fill boundary against one well log: a matched curve, or a fixed position across the track. */
export type ResolvedBoundary =
  | { readonly curve: Curve; readonly scale: ResolvedScale }
  | { readonly fraction: number };

export interface ResolvedFill {
  readonly fill: Fill;
  readonly a: ResolvedBoundary;
  readonly b: ResolvedBoundary;
}

export interface ResolvedCurveTrack extends ResolvedTrackBase<CurveTrack, ResolvedEntry> {
  /** The track's first curve scale, matched or not, which its gridlines follow. */
  readonly grid: ResolvedScale | null;
  /** The fills that can be drawn, in template order. */
  readonly fills: readonly ResolvedFill[];
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

/**
 * A fill's boundaries against the track's resolved entries, or null when it
 * can't be drawn: it names an entry that matched nothing (or isn't in this
 * track), its value can't be placed on the other boundary's scale, or
 * neither boundary is a curve.
 */
function resolveFill(fill: Fill, entries: readonly ResolvedEntry[]): ResolvedFill | null {
  const curveOf = (boundary: FillBoundary) => {
    if (boundary.kind !== "curve") return null;
    const { curve, scale } = entries.find((e) => e.entry.id === boundary.id) ?? {};
    return curve && scale ? { curve, scale } : null;
  };
  const curves = [curveOf(fill.a), curveOf(fill.b)];
  const [a, b] = [fill.a, fill.b].map((boundary, i): ResolvedBoundary | null => {
    if (boundary.kind === "curve") return curves[i];
    if (boundary.kind === "edge") return { fraction: boundary.edge === "left" ? 0 : 1 };
    const other = curves[1 - i];
    const fraction = other ? fractionOf(boundary.value, other.scale) : NaN;
    return Number.isFinite(fraction) ? { fraction } : null;
  });
  if (!a || !b || (!curves[0] && !curves[1])) return null;
  return { fill, a, b };
}

const boundaryPlacement = (boundary: ResolvedBoundary): BoundaryPlacement =>
  "curve" in boundary
    ? { source: scaleSource(boundary.curve.values, boundary.scale.type), mapping: mappingOf(boundary.scale) }
    : boundary;

export const curveKind: TrackKind<CurveTrack, ResolvedCurveTrack> = {
  resolve(track, log) {
    const curves = matchEntries(track.curves, log.curves.filter((c) => c.kind === "continuous"));
    const entries = track.curves.map((entry, i): ResolvedEntry => {
      const curve = curves[i];
      return { entry, curve, scale: curve ? resolveScale(entry.scale, curve) : null };
    });
    const fills = (track.fills ?? []).flatMap((fill) => resolveFill(fill, entries) ?? []);
    return { kind: "curve", track, grid: gridScale(entries[0]), entries, fills };
  },

  read(resolved, { log, md, gap }) {
    return resolved.entries.map(({ curve }) => {
      if (!curve) return null;
      return gap ? GAP : formatReading(valueAt(log, curve, md));
    });
  },

  draw(ctx, resolved, { log, frame, dpr, tokens }) {
    if (resolved.grid) strokeVerticalGrid(ctx, scaleGridlines(resolved.grid), frame, dpr, tokens);
    strokeDepthGrid(ctx, frame, dpr, tokens);

    // Fills sit on the gridlines and under the curves; their colours carry
    // alpha, so both read through. They follow each curve's clipped
    // position, so neither the clip below nor wrapping moves them. On a dark
    // track, near-neutral ones have their lightness mirrored (ADR-0006).
    for (const { fill, a, b } of resolved.fills) {
      const drawn = {
        ...fill,
        colourWhereALeft: adaptFill(fill.colourWhereALeft, tokens.bg),
        colourWhereARight: adaptFill(fill.colourWhereARight, tokens.bg),
      };
      fillPolygonPaths(ctx, fillPolygons(log.md, boundaryPlacement(a), boundaryPlacement(b), frame), drawn);
    }

    // Off-scale stretches run out of the track and are cut here, never pinned;
    // a wrap entry draws them again, shifted back, lighter. Colours are drawn
    // as stored on a light track and adapted on a dark one (ADR-0006); the
    // wrapped segments take the adapted colour at their lighter alpha.
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
      ctx.strokeStyle = adaptStroke(colour, tokens.bg);
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
