/**
 * Gridlines. Vertical ones come from a track's first curve scale: every
 * 1–9 × 10ⁿ on a log scale, with the decades major, or 10 divisions on a
 * linear one. Horizontal ones mark round depths.
 */

import { fractionOf, type ResolvedScale } from "./scale.ts";

export interface Gridline {
  /** Position across the track, strictly between its edges. */
  readonly fraction: number;
  readonly major: boolean;
}

const EDGE = 1e-9;

export function scaleGridlines(scale: ResolvedScale): Gridline[] {
  if (scale.type === "linear") {
    return Array.from({ length: 9 }, (_, i) => ({ fraction: (i + 1) / 10, major: false }));
  }
  const lo = Math.log10(Math.min(scale.left, scale.right));
  const hi = Math.log10(Math.max(scale.left, scale.right));
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [];
  const lines: Gridline[] = [];
  for (let decade = Math.floor(lo); decade <= Math.ceil(hi); decade++) {
    for (let m = 1; m <= 9; m++) {
      const fraction = fractionOf(m * 10 ** decade, scale);
      if (fraction > EDGE && fraction < 1 - EDGE) lines.push({ fraction, major: m === 1 });
    }
  }
  return lines.sort((p, q) => p.fraction - q.fraction);
}

const STEPS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];

/** The smallest round depth step at least `minPx` CSS px apart. */
export function depthStep(cssPxPerUnit: number, minPx: number): number {
  return STEPS.find((step) => step * cssPxPerUnit >= minPx) ?? STEPS[STEPS.length - 1];
}

/** Multiples of `step` from `top` to `base`, inclusive, without float drift. */
export function depthsEvery(step: number, top: number, base: number): number[] {
  const depths: number[] = [];
  for (let n = Math.ceil(top / step); n * step <= base; n++) depths.push(Math.round(n * step * 1e6) / 1e6);
  return depths;
}

/** Horizontal gridlines: minor ones at least 10 CSS px apart, major every 5th step or more. */
export function depthGridlines(top: number, base: number, cssPxPerUnit: number): { minor: number[]; major: number[] } {
  const minor = depthStep(cssPxPerUnit, 10);
  const major = STEPS.find((step) => step >= minor * 5) ?? minor * 5;
  return { minor: depthsEvery(minor, top, base), major: depthsEvery(major, top, base) };
}
