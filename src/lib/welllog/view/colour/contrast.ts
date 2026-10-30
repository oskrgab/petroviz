/**
 * sRGB colour basics: parsing `#RRGGBB[AA]`, WCAG relative luminance and
 * contrast ratio. Pure; the dark-background adaptation (#54) builds on it.
 */

export interface Rgb {
  /** 0–255 each; unrounded where a colour is being computed. */
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/** `#RGB`, `#RRGGBB` or `#RRGGBBAA` (alpha ignored). Throws on anything else. */
export function parseHex(hex: string): Rgb {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(hex.trim());
  if (!m) throw new Error(`Not a hex colour: ${hex}`);
  let digits = m[1];
  if (digits.length === 3) digits = [...digits].map((d) => d + d).join("");
  return {
    r: parseInt(digits.slice(0, 2), 16),
    g: parseInt(digits.slice(2, 4), 16),
    b: parseInt(digits.slice(4, 6), 16),
  };
}

/** `#RRGGBB`, each channel rounded to a byte. */
export function hexOf({ r, g, b }: Rgb): string {
  return `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

/** A 0–255 sRGB channel, linearised to 0–1. */
export const linear = (channel: number) => {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** WCAG 2 relative luminance, 0 (black) to 1 (white). */
export function relativeLuminance(colour: string | Rgb): number {
  const { r, g, b } = typeof colour === "string" ? parseHex(colour) : colour;
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** WCAG 2 contrast ratio, 1 to 21. */
export function contrastRatio(a: string | Rgb, b: string | Rgb): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** The two label inks for text on a categorical colour (#37). */
export const LABEL_DARK = "#111111";
export const LABEL_LIGHT = "#F8FAFC";

/** Whichever label ink contrasts more with `background`; the dark one on a tie. */
export function labelColour(background: string): typeof LABEL_DARK | typeof LABEL_LIGHT {
  return contrastRatio(LABEL_DARK, background) >= contrastRatio(LABEL_LIGHT, background) ? LABEL_DARK : LABEL_LIGHT;
}
