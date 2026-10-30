/**
 * What every track kind provides. Each kind is one folder exporting one
 * TrackKind; `kinds/index.ts` lists them and is checked against the closed
 * Track union. Kind components (headers) are listed apart, in
 * `kinds/headers.ts`, so this side stays loadable by `node --test`.
 */

import type { Curve, WellLog } from "../../core/index.ts";
import type { Frame } from "../geometry/polyline.ts";
import type { DepthRef } from "../interval.ts";
import type { ResolvedScale } from "../geometry/scale.ts";
import type { CurveEntry, Entry, Track } from "../template/types.ts";

/** Any entry against one well log. */
export interface MatchedEntry<E extends Entry = Entry> {
  readonly entry: E;
  /** Null when the entry matches nothing in this well log. */
  readonly curve: Curve | null;
}

/** A curve entry against one well log. */
export interface ResolvedEntry extends MatchedEntry<CurveEntry> {
  /** Null exactly when `curve` is. */
  readonly scale: ResolvedScale | null;
}

export interface ResolvedTrackBase<T extends Track, E extends MatchedEntry = MatchedEntry> {
  readonly kind: T["kind"];
  readonly track: T;
  /** The track's entries, matched or not; empty for kinds without curves. */
  readonly entries: readonly E[];
}

/** Colours and type the canvas needs, read from the --welllog-* tokens. */
export interface Tokens {
  readonly grid: string;
  readonly gridMajor: string;
  readonly text: string;
  readonly textMuted: string;
  readonly zoneLine: string;
  readonly font: string;
}

export interface DrawInput {
  readonly log: WellLog;
  readonly frame: Frame;
  readonly dpr: number;
  readonly tokens: Tokens;
  /** The depth reference the view shows, after the well log's own limits. */
  readonly depthRef: DepthRef;
  /** The item under the pointer, as the kind's `hit` found it, or null. */
  readonly hovered: number | null;
}

export interface TrackKind<T extends Track, R> {
  resolve(track: T, log: WellLog): R;
  /** Draws the whole track into a cleared canvas sized to `input.frame`. */
  draw(ctx: CanvasRenderingContext2D, resolved: R, input: DrawInput): void;
  /**
   * The item at an MD (a zone's index), for kinds whose items highlight
   * under the pointer. The track redraws only when the item changes.
   */
  hit?(resolved: R, md: number): number | null;
}
