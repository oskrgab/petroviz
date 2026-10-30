/**
 * Track widths. A track's width is relative (1 is a standard track), and no
 * track is narrower than its share of MIN_STANDARD_TRACK_PX. When the tracks
 * can't fit at their minimums, the log view scrolls sideways.
 */

import type { Track } from "./template/types.ts";

/** The narrowest a standard track is drawn, in CSS px. */
export const MIN_STANDARD_TRACK_PX = 110;

/** A CSS grid-template-columns value for the tracks. */
export function trackColumns(tracks: readonly Pick<Track, "width">[]): string {
  return tracks.map(({ width }) => `minmax(${width * MIN_STANDARD_TRACK_PX}px, ${width}fr)`).join(" ");
}
