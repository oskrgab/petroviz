/**
 * The template model (ADR-0003, #28): a log view layout that applies to any
 * well log. It is the layout model itself: what is drawn is derived from the
 * current template and the well log by `resolveTemplate`, never stored.
 *
 * Curve, depth, discrete and zone tracks so far. Fills join in their own
 * ticket.
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

/**
 * Fixed scale ends, in the unit they were written for. `left` may be larger
 * than `right`, which runs the scale reversed. Against a curve in another
 * unit the ends convert by a known factor, or else fall back on
 * `percentile [1, 99]` in the same direction.
 */
export interface FixedEnds {
  readonly kind: "fixed";
  readonly left: number;
  readonly right: number;
  readonly unit: string;
}

/**
 * Ends `width` apart, centred on the curve's median over the whole well (SP).
 * On a log scale the median is taken of log10 and `width` is in decades.
 */
export interface CentredOnMedianEnds {
  readonly kind: "centredOnMedian";
  readonly width: number;
  /** Larger values to the left. */
  readonly reversed: boolean;
}

/**
 * Ends at the curve's `lo` and `hi` percentiles (0–100) over the whole well.
 * On a log scale they are taken of log10.
 */
export interface PercentileEnds {
  readonly kind: "percentile";
  readonly lo: number;
  readonly hi: number;
  /** Larger values to the left. */
  readonly reversed: boolean;
}

/**
 * Fixed ends are written in the template; the others are computed from the
 * matched curve, once per well log, never from the visible interval.
 */
export type ScaleEnds = FixedEnds | CentredOnMedianEnds | PercentileEnds;

/** How a curve's values map across its track. */
export interface CurveScale {
  readonly type: ScaleType;
  readonly ends: ScaleEnds;
}

/**
 * `wrap` also draws an off-scale value shifted back by one scale width (one
 * span on a log scale), lighter; `clip` only cuts it at the track edge.
 */
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

/**
 * The FGDC-STD-013-2006 lithologic patterns petroviz draws, by pattern
 * number, as simple canvas hatches. 658 (coal) is drawn solid.
 */
export const FGDC_PATTERNS = [607, 620, 623, 626, 627, 642, 658, 667, 668, 670, 711, 718] as const;

export type FgdcPattern = (typeof FGDC_PATTERNS)[number];

/** How one discrete code is drawn. Opaque, and as stored in both themes (#37). */
export interface CodeStyle {
  /** `#RRGGBB`. */
  readonly colour: string;
  /** No pattern draws the colour alone. */
  readonly pattern?: FgdcPattern;
}

/** A discrete track's one curve entry. */
export interface DiscreteEntry {
  /** Stable and unique within the template. */
  readonly id: string;
  /** Matches discrete curves only. */
  readonly select: readonly Selector[];
  /** Code (as a string) → style, replacing the curve family default for that code. */
  readonly codes?: Readonly<Record<string, CodeStyle>>;
}

/** Any track's curve entry. */
export type Entry = CurveEntry | DiscreteEntry;

/** One discrete curve drawn as blocks of colour, such as lithology. */
export interface DiscreteTrack extends TrackBase {
  readonly kind: "discrete";
  readonly curve: DiscreteEntry;
}

/** One zone set, matched by its name. */
export interface ZoneTrack extends TrackBase {
  readonly kind: "zone";
  readonly zoneSet: string;
  /** Zone name → `#RRGGBB`; other names take a hashed categorical colour. */
  readonly colours?: Readonly<Record<string, string>>;
}

/** A closed union: the track kind registry is checked against it. */
export type Track = CurveTrack | DepthTrack | DiscreteTrack | ZoneTrack;

export type TrackKindName = Track["kind"];

export interface Template {
  readonly name: string;
  readonly description?: string;
  /** In display order. */
  readonly tracks: readonly Track[];
}
