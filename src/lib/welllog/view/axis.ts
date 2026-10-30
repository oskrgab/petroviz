/**
 * The depth axis the log view draws down (#48): MD, or TVDSS. The interval
 * stays in MD whatever the axis (interval.ts); what is drawn, labelled and
 * navigated is placed on the axis through these conversions.
 *
 * On TVDSS, MD ↔ TVDSS is core's: linear between valid samples, never
 * extrapolated. So the axis covers only the MD range that has TVDSS, and a
 * row outside it has no place on the axis and isn't drawn.
 */

import { mdAt, tvdssAt, type WellLog } from "../core/index.ts";
import { wholeWell, type DepthInterval, type DepthRef } from "./interval.ts";
import { effectiveInterval } from "./navigation.ts";

export interface DepthAxis {
  readonly ref: DepthRef;
  readonly log: WellLog;
  /**
   * Each row's depth on the axis, non-decreasing: its MD, or its TVDSS
   * interpolated across rows without it. -Infinity above its extent, and
   * Infinity below it, so the rows can still be searched.
   */
  readonly depths: Float64Array;
  /** The MD the axis covers: the whole well, or the rows with TVDSS. */
  readonly extent: DepthInterval;
}

/** The first and last rows with TVDSS, or null when it has fewer than two. */
function tvdssRows(log: WellLog): [number, number] | null {
  const { tvdss } = log;
  if (!tvdss) return null;
  let first = 0;
  while (first < tvdss.length && Number.isNaN(tvdss[first])) first++;
  let last = tvdss.length - 1;
  while (last > first && Number.isNaN(tvdss[last])) last--;
  return last > first ? [first, last] : null;
}

/** Whether the well log has TVDSS to draw against: two valid samples at least. */
export function hasTvdss(log: WellLog): boolean {
  return tvdssAxis(log) !== null;
}

/**
 * The depth reference shown: the bound one, or MD when the well log has no
 * TVDSS. Derived, never written back, so the preference outlives such a
 * well log.
 */
export function effectiveDepthRef(depthRef: DepthRef, log: WellLog): DepthRef {
  return depthRef === "tvdss" && hasTvdss(log) ? "tvdss" : "md";
}

const tvdssAxes = new WeakMap<WellLog, DepthAxis | null>();

/** Built in one pass: each row's TVDSS, interpolated across its NaN rows. */
function tvdssAxis(log: WellLog): DepthAxis | null {
  if (tvdssAxes.has(log)) return tvdssAxes.get(log)!;
  const rows = tvdssRows(log);
  let axis: DepthAxis | null = null;
  if (rows) {
    const { md } = log;
    const tvdss = log.tvdss!;
    const [first, last] = rows;
    const depths = new Float64Array(md.length);
    depths.fill(-Infinity, 0, first);
    depths.fill(Infinity, last + 1);
    let above = first;
    for (let i = first; i <= last; i++) {
      if (Number.isNaN(tvdss[i])) continue;
      for (let j = above + 1; j < i; j++) {
        depths[j] = tvdss[above] + ((md[j] - md[above]) / (md[i] - md[above])) * (tvdss[i] - tvdss[above]);
      }
      depths[i] = tvdss[i];
      above = i;
    }
    axis = { ref: "tvdss", log, depths, extent: { top: md[first], base: md[last] } };
  }
  tvdssAxes.set(log, axis);
  return axis;
}

/** The axis for a depth reference; MD when the well log has no TVDSS. */
export function depthAxis(log: WellLog, ref: DepthRef): DepthAxis {
  if (ref === "tvdss") {
    const axis = tvdssAxis(log);
    if (axis) return axis;
  }
  return { ref: "md", log, depths: log.md, extent: wholeWell(log) };
}

/** An MD's depth on the axis; -Infinity above its extent and Infinity below. */
export function toAxis(axis: DepthAxis, md: number): number {
  if (axis.ref === "md") return md;
  if (md < axis.extent.top) return -Infinity;
  if (md > axis.extent.base) return Infinity;
  return tvdssAt(axis.log, md);
}

/** The MD at a depth on the axis; NaN off its extent. */
export function toMd(axis: DepthAxis, depth: number): number {
  return axis.ref === "md" ? depth : mdAt(axis.log, depth);
}

/** An MD interval as axis depths; a bound off the axis is infinite (see toAxis). */
export function intervalOnAxis(axis: DepthAxis, { top, base }: DepthInterval): DepthInterval {
  return { top: toAxis(axis, top), base: toAxis(axis, base) };
}

/** An interval of axis depths in MD; for intervals within the axis's extent. */
export function intervalToMd(axis: DepthAxis, { top, base }: DepthInterval): DepthInterval {
  return { top: toMd(axis, top), base: toMd(axis, base) };
}

/**
 * The part of an MD interval (a zone, say) that lies on the axis, as axis
 * depths; the axis's whole extent when none of it does.
 */
export function onAxisWithin(axis: DepthAxis, interval: DepthInterval): DepthInterval {
  return effectiveInterval(intervalOnAxis(axis, interval), intervalOnAxis(axis, axis.extent));
}
