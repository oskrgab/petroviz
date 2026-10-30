/**
 * The fill editor's choices (#56): a fill boundary as one `<select>` value,
 * where a value starts when chosen, and a fill colour's alpha kept across a
 * colour picked or set to none. Colours are `#RRGGBBAA` (types.ts).
 */

import type { ResolvedScale } from "./geometry/scale.ts";
import { FILL_ALPHA } from "./template/defaults.ts";
import type { FillBoundary } from "./template/types.ts";

/** A boundary as a choice: `curve:<entry id>`, `value`, `edge:left` or `edge:right`. */
export function boundaryChoice(boundary: FillBoundary): string {
  switch (boundary.kind) {
    case "curve":
      return `curve:${boundary.id}`;
    case "value":
      return "value";
    case "edge":
      return `edge:${boundary.edge}`;
  }
}

/**
 * The boundary a choice stands for. A value starts half-way across `other`,
 * the curve scale of the other side as drawn, or at 0 without one.
 */
export function boundaryOf(choice: string, other: ResolvedScale | null): FillBoundary {
  if (choice.startsWith("curve:")) return { kind: "curve", id: choice.slice("curve:".length) };
  if (choice === "edge:left" || choice === "edge:right") return { kind: "edge", edge: choice === "edge:left" ? "left" : "right" };
  return { kind: "value", value: other ? Number(midway(other).toPrecision(2)) : 0 };
}

/** The value half-way across a curve scale: the geometric mean of its ends on a log scale. */
export function midway({ left, right, type }: ResolvedScale): number {
  return type === "log" ? Math.sqrt(left * right) : (left + right) / 2;
}

/** Whether a fill colour is none: fully transparent, so its side isn't shaded. */
export function isNoColour(colour: string): boolean {
  return colour.length === 9 && colour.slice(7).toUpperCase() === "00";
}

/** The colour with a picked `#rrggbb`, keeping its alpha; a side that had none takes the default fills' alpha. */
export function colourWithRgb(colour: string, rgb: string): string {
  const alpha = colour.length === 9 && !isNoColour(colour) ? colour.slice(7) : FILL_ALPHA;
  return `${rgb.toUpperCase()}${alpha}`;
}

/** What a side with no colour of its own (`#00000000`, as the GR fills' unused sides) comes back from none as. */
export const BACK_FROM_NONE = "#BEBEBE";

/**
 * The colour set to none, or back from none at the default fills' alpha,
 * keeping its `#RRGGBB`; `#00000000` comes back grey, not black.
 */
export function colourWithNone(colour: string, none: boolean): string {
  const rgb = colour.slice(0, 7).toUpperCase();
  if (none) return `${rgb}00`;
  return `${isNoColour(colour) && rgb === "#000000" ? BACK_FROM_NONE : rgb}${FILL_ALPHA}`;
}
