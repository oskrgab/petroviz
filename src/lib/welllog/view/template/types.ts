/**
 * The template model (ADR-0003, #28): a log view layout that applies to any
 * well log. It is the layout model itself: what is drawn is derived from the
 * current template and the well log by `resolveTemplate`, never stored.
 *
 * Curve and depth tracks so far. Discrete and zone tracks, fills and computed
 * curve scales join in their own tickets.
 */

import type { DepthRef } from "../interval.ts";

/**
 * How a curve entry finds its curve. The first selector in the list that
 * matches a curve wins. `mnemonic` matches case-insensitively, `family` takes
 * a curve family id (see core's CURVE_FAMILIES).
 */
export interface Selector {
  readonly by: "key" | "mnemonic" | "family";
  readonly value: string;
}

export type ScaleType = "linear" | "log";

/** Fixed scale ends, in the unit they were written for. */
export interface FixedEnds {
  readonly kind: "fixed";
  readonly left: number;
  readonly right: number;
  readonly unit: string;
}

/**
 * How a curve's values map across its track. `left` may be larger than
 * `right`, which runs the scale reversed.
 */
export interface CurveScale {
  readonly type: ScaleType;
  readonly ends: FixedEnds;
}

export type OffScale = "wrap" | "clip";

export type Dash = "solid" | "dashed" | "dotted" | "dashdot";

export interface CurveStyle {
  /** `#RRGGBB`, written for a light background (ADR-0006). */
  readonly colour: string;
  /** Line width in CSS px. */
  readonly width: number;
  readonly dash: Dash;
}

export interface CurveEntry {
  /** Stable and unique within the template. Fills refer to entries by it. */
  readonly id: string;
  readonly select: readonly Selector[];
  readonly scale: CurveScale;
  readonly offScale: OffScale;
  readonly style: CurveStyle;
}

interface TrackBase {
  /** Stable and unique within the template. */
  readonly id: string;
  /** Relative: 1 is a standard track, a depth track about 0.5. */
  readonly width: number;
}

export interface CurveTrack extends TrackBase {
  readonly kind: "curve";
  readonly curves: readonly CurveEntry[];
}

/** `active` follows the log view's depth reference; `md` and `tvdss` are fixed. */
export type DepthTrackRef = "active" | DepthRef;

export interface DepthTrack extends TrackBase {
  readonly kind: "depth";
  readonly ref: DepthTrackRef;
}

/** A closed union: the track kind registry is checked against it. */
export type Track = CurveTrack | DepthTrack;

export type TrackKindName = Track["kind"];

export interface Template {
  readonly name: string;
  readonly description?: string;
  /** In display order. */
  readonly tracks: readonly Track[];
}
