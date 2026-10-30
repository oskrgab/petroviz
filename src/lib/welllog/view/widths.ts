/**
 * Track widths. A track's width is relative (1 is a standard track), and no
 * track is narrower than its share of MIN_STANDARD_TRACK_PX. When the tracks
 * can't fit at their minimums, the log view scrolls sideways.
 *
 * Every track's minimum is the same multiple of its width, so the grid lays
 * them all out at one number of px per unit of width: their shares of the
 * room there is, or MIN_STANDARD_TRACK_PX when that is more.
 */

import type { Track } from "./template/types.ts";

/** The narrowest a standard track is drawn, in CSS px. */
export const MIN_STANDARD_TRACK_PX = 110;

/** The relative widths a dragged border keeps to. */
export const MIN_TRACK_WIDTH = 0.2;
export const MAX_TRACK_WIDTH = 12;

/** A relative width kept within MIN_TRACK_WIDTH–MAX_TRACK_WIDTH, to two decimals. */
export function boundedWidth(width: number): number {
  return Math.round(Math.min(MAX_TRACK_WIDTH, Math.max(MIN_TRACK_WIDTH, width)) * 100) / 100;
}

/** A CSS grid-template-columns value for the tracks. */
export function trackColumns(tracks: readonly Pick<Track, "width">[]): string {
  return tracks.map(({ width }) => `minmax(${width * MIN_STANDARD_TRACK_PX}px, ${width}fr)`).join(" ");
}

export interface Resize {
  /** The dragged track's relative width now. */
  readonly width: number;
  /** The relative widths of the tracks before it, summed, and of those after it. */
  readonly before: number;
  readonly after: number;
  /** The room the tracks have, in CSS px. */
  readonly available: number;
  /** Where its right border was dragged to, in CSS px from the first track's left edge. */
  readonly edge: number;
}

/**
 * The relative width that lays a track's right border out at `edge`, the
 * other tracks keeping theirs (#56), so the border stays under the pointer.
 * While the tracks fit the row, they share it and the tracks on either side
 * give or take room; past its end they overflow at their minimums. The
 * last track (and a lone one) reaches the row's end whatever its width, so
 * its width only changes once it is dragged past it; it is narrowed in the
 * track list. Kept within bounds (boundedWidth).
 */
export function resizedWidth({ width, before, after, available, edge }: Resize): number {
  const fits = (next: number) => available / (before + after + next) >= MIN_STANDARD_TRACK_PX;
  let next: number;
  if (edge < available && after > 0) {
    // Sharing the row: edge / available = (before + next) / (before + next + after).
    const shared = (edge * (before + after) - available * before) / (available - edge);
    next = shared <= 0 ? MIN_TRACK_WIDTH : fits(shared) ? shared : edge / MIN_STANDARD_TRACK_PX - before;
  } else {
    // Overflowing: edge = (before + next) × the minimum.
    const overflowing = edge / MIN_STANDARD_TRACK_PX - before;
    next = overflowing > 0 && !fits(overflowing) ? overflowing : width;
  }
  return boundedWidth(next);
}
