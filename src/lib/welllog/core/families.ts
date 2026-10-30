/**
 * Curve families, and the shared mnemonic → curve family table every log
 * adapter assigns them from.
 *
 * The table covers every FORCE 2020 column and the widely used LAS mnemonics
 * in the curve family defaults note (docs/research/curve-family-defaults.md
 * on the `research/curve-family-defaults` branch). An unknown mnemonic falls
 * back on its unit where the unit says enough.
 */

export const CURVE_FAMILIES = [
  "gamma-ray",
  "spectral-gamma-ray",
  "sp",
  "caliper",
  "bit-size",
  "differential-caliper",
  "resistivity-deep",
  "resistivity-medium",
  "resistivity-shallow",
  "resistivity-micro",
  "resistivity-unknown-depth",
  "bulk-density",
  "density-correction",
  "neutron-porosity",
  "pef",
  "sonic-compressional",
  "sonic-shear",
  "rop",
  "mud-weight",
  "lithology",
  "unknown",
] as const;

export type CurveFamily = (typeof CURVE_FAMILIES)[number];

const MEMBERS: Record<Exclude<CurveFamily, "unknown" | "resistivity-unknown-depth">, string[]> = {
  "gamma-ray": ["GR", "GRC", "ECGR", "GAM", "GRS"],
  "spectral-gamma-ray": ["SGR", "HSGR", "CGR", "HCGR"],
  sp: ["SP", "SPBR", "SP_S"],
  caliper: ["CALI", "CAL", "HCAL", "LCAL", "HLCA", "C1", "C2", "CALX", "CALY"],
  "bit-size": ["BS"],
  "differential-caliper": ["DCAL"],
  "resistivity-deep": ["RDEP", "ILD", "RILD", "IDPH", "LLD", "HLLD", "RT", "AT90", "AF90"],
  "resistivity-medium": ["RMED", "ILM", "RILM", "IMPH", "LLS", "HLLS", "AT30"],
  "resistivity-shallow": ["RSHA", "SFL", "SFLU", "SFLA", "AT10", "RS"],
  "resistivity-micro": ["RXO", "RMIC", "MSFL", "MLL", "RXOZ", "MINV", "MNOR"],
  "bulk-density": ["RHOB", "RHOZ", "ZDEN", "DEN", "DENS", "RHOM"],
  "density-correction": ["DRHO", "DRH", "HDRA", "ZCOR", "DCOR"],
  "neutron-porosity": ["NPHI", "TNPH", "NPOR", "CNC", "NPHS", "NPSS", "APLC", "NPH"],
  pef: ["PEF", "PE", "PEFZ", "PEFL"],
  "sonic-compressional": ["DTC", "DT", "DTCO", "AC", "DTP"],
  "sonic-shear": ["DTS", "DTSM", "DT4S", "DTSF"],
  rop: ["ROP", "ROPA", "ROP5"],
  "mud-weight": ["MUDWEIGHT", "DFD"],
  lithology: ["FORCE_2020_LITHOFACIES_LITHOLOGY"],
};

/** Upper-case mnemonic → curve family. */
export const MNEMONIC_FAMILIES: Readonly<Record<string, CurveFamily>> = Object.freeze(
  Object.fromEntries(
    Object.entries(MEMBERS).flatMap(([family, mnemonics]) =>
      mnemonics.map((mnemonic) => [mnemonic, family as CurveFamily]),
    ),
  ),
);

/** Normalised unit → curve family, for mnemonics the table doesn't know. */
const UNIT_FAMILIES: Readonly<Record<string, CurveFamily>> = {
  gapi: "gamma-ray",
  mv: "sp",
  "b/e": "pef",
  "us/ft": "sonic-compressional",
  "m/h": "rop",
  "m/hr": "rop",
  "ft/h": "rop",
  "ft/hr": "rop",
  // A resistivity unit can't tell deep from shallow.
  ohmm: "resistivity-unknown-depth",
};

function normaliseUnit(unit: string): string {
  return unit
    .trim()
    .toLowerCase()
    .replace(/[µμ]/g, "u")
    .replace(/^ohm[\s.·\-_]*m$/, "ohmm");
}

/**
 * The curve family of a curve, from its mnemonic (any case), else its unit,
 * else `unknown`. An adapter may override it where it knows better.
 */
export function curveFamilyOf(mnemonic: string, unit = ""): CurveFamily {
  return (
    MNEMONIC_FAMILIES[mnemonic.trim().toUpperCase()] ??
    UNIT_FAMILIES[normaliseUnit(unit)] ??
    "unknown"
  );
}
