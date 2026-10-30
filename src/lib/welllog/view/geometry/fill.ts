/**
 * Fill polygons: the area between two boundaries, split where they cross
 * and labelled by which one lies to the left on screen.
 *
 * A curve boundary is placed at its clipped position: x held within the
 * track, with no inset. An off-scale value sits on the edge it ran past, and
 * a wrapped line is never consulted, so wrapping can't move a fill.
 */

import { drawnRows, pixelsPerUnit, type Frame } from "./polyline.ts";
import type { Mapping } from "./scale.ts";

/**
 * One side of a fill, ready to place: a curve's scale source (values, or
 * log10 on a log scale) with its mapping, or a fixed position across the
 * track (an edge is 0 or 1, a value its fraction on the other curve's scale).
 */
export type BoundaryPlacement =
  | { readonly source: Float32Array; readonly mapping: Mapping }
  | { readonly fraction: number };

export interface FillPolygon {
  /** Whether boundary `a` lies left of `b` throughout this polygon. */
  readonly aLeft: boolean;
  /** Flat [x, y, …] in device px: down along `a`, then back up along `b`. */
  readonly points: Float32Array;
}

/** A fraction held within the track. */
const withinTrack = (fraction: number) => Math.min(1, Math.max(0, fraction));

/**
 * The fill between `a` and `b` as polygons. Rows come from drawnRows over
 * both curves, so the fill breaks wherever either has no value and is
 * decimated with them. Each polygon lies wholly on one side: it is cut where
 * the boundaries cross, at the crossing interpolated between rows. A
 * stretch where they coincide throughout covers nothing and is left out.
 */
export function fillPolygons(depths: Float64Array, a: BoundaryPlacement, b: BoundaryPlacement, frame: Frame): FillPolygon[] {
  const sources = [a, b].flatMap((p) => ("source" in p ? [p.source] : []));
  if (sources.length === 0) return [];
  const rows = drawnRows(depths, sources, frame);
  const k = pixelsPerUnit(frame);
  const xOf = (p: BoundaryPlacement) =>
    "source" in p
      ? (i: number) => withinTrack(p.mapping.a * p.source[i] + p.mapping.b) * frame.width
      : () => withinTrack(p.fraction) * frame.width;
  const xa = xOf(a);
  const xb = xOf(b);

  const polygons: FillPolygon[] = [];
  // The polygon being built, as its `a` side and its `b` side, top down.
  let aSide: number[] = [];
  let bSide: number[] = [];
  let side = 0; // -1 while a is left, 1 while a is right, 0 before either is known
  const close = () => {
    if (side !== 0 && aSide.length >= 4) {
      const points = new Float32Array(aSide.length + bSide.length);
      points.set(aSide);
      for (let j = bSide.length - 2, o = aSide.length; j >= 0; j -= 2, o += 2) {
        points[o] = bSide[j];
        points[o + 1] = bSide[j + 1];
      }
      polygons.push({ aLeft: side < 0, points });
    }
    aSide = [];
    bSide = [];
    side = 0;
  };

  let prev: { xa: number; xb: number; y: number } | null = null;
  for (const i of rows) {
    if (i < 0) {
      close();
      prev = null;
      continue;
    }
    const point = { xa: xa(i), xb: xb(i), y: (depths[i] - frame.top) * k };
    const sign = Math.sign(point.xa - point.xb);
    if (sign !== 0 && side !== 0 && sign !== side && prev) {
      // They cross between the previous row and this one: end the polygon
      // there and start the next from the same point.
      const before = prev.xa - prev.xb;
      const t = before / (before - (point.xa - point.xb));
      const x = prev.xa + t * (point.xa - prev.xa);
      const y = prev.y + t * (point.y - prev.y);
      aSide.push(x, y);
      bSide.push(x, y);
      close();
      aSide.push(x, y);
      bSide.push(x, y);
    }
    if (sign !== 0) side = sign;
    aSide.push(point.xa, point.y);
    bSide.push(point.xb, point.y);
    prev = point;
  }
  close();
  return polygons;
}
