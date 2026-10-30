/**
 * Template colours on a dark track (ADR-0006). Templates are written for a
 * light background, so on one they are drawn as stored. On a dark one
 * (relative luminance below 0.18):
 *
 * - a stroke below 4.5:1 against the track has its OKLCH lightness mirrored
 *   (L → 1 − L), hue kept, then is lifted only as far as 4.5:1 needs; one
 *   already on the light side is only lifted;
 * - a fill keeps its colour, except a near-neutral one (OKLCH chroma below
 *   0.03), whose lightness is mirrored.
 *
 * Alpha is kept either way. Pure, and memoised per stored colour and track
 * background.
 */

import { contrastRatio, hexOf, linear, parseHex, relativeLuminance, type Rgb } from "./contrast.ts";

/** Below this relative luminance a track background counts as dark. */
const DARK_BELOW = 0.18;
/** What an adapted stroke reaches against the track: text is drawn in it. */
const STROKE_CONTRAST = 4.5;
/** Fills with less OKLCH chroma than this count as near-neutral. */
const NEUTRAL_CHROMA = 0.03;

export function isDarkBackground(background: string): boolean {
  return relativeLuminance(background) < DARK_BELOW;
}

export interface Oklch {
  readonly L: number;
  readonly C: number;
  /** Hue in radians. */
  readonly h: number;
}

type Linear = [number, number, number];

const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

/** A colour's OKLCH coordinates, alpha ignored. */
export function oklch(hex: string): Oklch {
  const { r, g, b } = parseHex(hex);
  const [lr, lg, lb] = [r, g, b].map(linear);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { L, C: Math.hypot(A, B), h: Math.atan2(B, A) };
}

/** OKLCH to linear sRGB, possibly out of gamut. */
function linearOf({ L, C, h }: Oklch): Linear {
  const A = C * Math.cos(h);
  const B = C * Math.sin(h);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inGamut = (rgb: Linear) => rgb.every((c) => c >= -1e-4 && c <= 1 + 1e-4);

/** sRGB, 0–255 unrounded, at this lightness and hue, with chroma reduced only as far as sRGB needs. */
function rgbOf(colour: Oklch): Rgb {
  let rgb = linearOf(colour);
  if (!inGamut(rgb)) {
    let lo = 0;
    let hi = colour.C;
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(linearOf({ ...colour, C: mid }))) lo = mid;
      else hi = mid;
    }
    rgb = linearOf({ ...colour, C: lo });
  }
  const [r, g, b] = rgb.map((c) => toGamma(Math.min(1, Math.max(0, c))) * 255);
  return { r, g, b };
}

/** The `AA` of a `#RRGGBBAA`, or "" for an opaque colour. */
const alphaOf = (hex: string) => (hex.trim().length === 9 ? hex.trim().slice(7).toUpperCase() : "");

/**
 * A contrast ratio as quoted, to one decimal. The ADR-0006 colours are lifts
 * to 4.5:1 rounded to bytes, which land between 4.48 and 4.52; and pure red,
 * 4.46:1 on the dark track, reads as it is.
 */
export const quotedContrast = (a: string | Rgb, b: string) => Math.round(contrastRatio(a, b) * 10) / 10;

/** The least rise in lightness, hue kept, that reaches the stroke contrast on a dark background. */
function lift(colour: Oklch, background: string): string {
  let lo = colour.L;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (contrastRatio(rgbOf({ ...colour, L: mid }), background) >= STROKE_CONTRAST) hi = mid;
    else lo = mid;
  }
  return hexOf(rgbOf({ ...colour, L: hi }));
}

function strokeOnDark(stored: string, background: string): string {
  if (quotedContrast(stored, background) >= STROKE_CONTRAST) return stored;
  const colour = oklch(stored);
  const mirrored = colour.L < 0.5 ? { ...colour, L: 1 - colour.L } : colour;
  const opaque = hexOf(rgbOf(mirrored));
  const drawn = quotedContrast(opaque, background) >= STROKE_CONTRAST ? opaque : lift(mirrored, background);
  return drawn + alphaOf(stored);
}

function fillOnDark(stored: string): string {
  const colour = oklch(stored);
  if (colour.C >= NEUTRAL_CHROMA) return stored;
  return hexOf(rgbOf({ ...colour, L: 1 - colour.L })) + alphaOf(stored);
}

const memo = new Map<string, string>();

function memoised(kind: "stroke" | "fill", stored: string, background: string, adapt: () => string): string {
  const key = `${kind} ${stored} ${background}`;
  let drawn = memo.get(key);
  if (drawn === undefined) {
    drawn = adapt();
    memo.set(key, drawn);
  }
  return drawn;
}

/** A curve line, wrapped segment or header text colour, as drawn on `background`. */
export function adaptStroke(stored: string, background: string): string {
  return memoised("stroke", stored, background, () =>
    isDarkBackground(background) ? strokeOnDark(stored, background) : stored,
  );
}

/** A fill colour, as drawn on `background`. */
export function adaptFill(stored: string, background: string): string {
  return memoised("fill", stored, background, () => (isDarkBackground(background) ? fillOnDark(stored) : stored));
}
