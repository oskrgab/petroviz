/**
 * Units of fixed curve scale ends (#29). A fixed scale records the unit its
 * ends were written in; against a curve in another unit, the ends convert by
 * a known factor. Curve values are never converted.
 */

/**
 * Normalised spelling → quantity and the factor to that quantity's base
 * unit. Spellings cover FORCE 2020 and common LAS 2.0 files.
 */
const UNITS = new Map<string, { readonly quantity: string; readonly factor: number }>();

function define(quantity: string, factor: number, ...spellings: string[]) {
  for (const spelling of spellings) UNITS.set(spelling, { quantity, factor });
}

define("length", 25.4, "in", "inch", "inches", "in.");
define("length", 1, "mm");
define("density", 1000, "g/cm3", "g/cc", "g/c3", "gm/cc", "gr/cc", "gm/cm3");
define("density", 1, "kg/m3", "k/m3");
define("fraction", 1, "v/v", "dec", "frac", "fraction", "m3/m3");
define("fraction", 0.01, "%", "pu", "p.u.", "pct", "percent");
define("slowness", 1 / 0.3048, "us/ft", "us/f", "uspf");
define("slowness", 1, "us/m");
define("rate", 1, "m/h", "m/hr");
define("rate", 0.3048, "ft/h", "ft/hr", "f/h", "f/hr");
// Spellings of one unit that normalise() doesn't already join (ohm·m, OHMM, ohm-m all become ohmm).
define("gamma", 1, "gapi", "api");
define("resistivity", 1, "ohmm");

function normalise(unit: string): string {
  return unit
    .trim()
    .toLowerCase()
    .replace(/[µμ]/g, "u")
    .replace(/³/g, "3")
    .replace(/\s+/g, "")
    .replace(/^ohm[.·\-_]?m$/, "ohmm");
}

/**
 * The factor that turns a value in `from` into one in `to`: 1 when they are
 * the same unit (both blank included), null when no factor is known or only
 * one of them is blank.
 */
export function conversionFactor(from: string, to: string): number | null {
  const fromName = normalise(from);
  const toName = normalise(to);
  if (fromName === toName) return 1;
  const fromUnit = UNITS.get(fromName);
  const toUnit = UNITS.get(toName);
  if (!fromUnit || !toUnit || fromUnit.quantity !== toUnit.quantity) return null;
  return fromUnit.factor / toUnit.factor;
}
