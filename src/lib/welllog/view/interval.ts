/**
 * The visible depth interval, always in MD whatever the depth reference.
 */

import type { WellLog } from "../core/index.ts";

export interface DepthInterval {
  /** MD at the top of the view. */
  readonly top: number;
  /** MD at the bottom of the view; below `top`. */
  readonly base: number;
}

export type DepthRef = "md" | "tvdss";

/** How the top bar and depth tracks name each depth reference. */
export const DEPTH_REF_LABELS: Readonly<Record<DepthRef, string>> = { md: "MD", tvdss: "TVDSS" };

/** The well log's whole MD range; one depth unit for a single-row well log. */
export function wholeWell(log: WellLog): DepthInterval {
  const top = log.md[0];
  const last = log.md[log.md.length - 1];
  return { top, base: last > top ? last : top + 1 };
}
