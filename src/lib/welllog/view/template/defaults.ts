/**
 * Curve family display defaults, and the default template built from them
 * (#29). Values come from the curve family defaults note
 * (docs/research/curve-family-defaults.md on the research/curve-family-defaults
 * branch); colours are written for a light background (ADR-0006).
 *
 * SP, mud weight, unknown-depth resistivity and `unknown` have computed curve
 * scales and join with them (#43). Lithology joins with the discrete track
 * (#45).
 */

import type { CurveFamily } from "../../core/index.ts";
import type { CurveEntry, CurveScale, CurveStyle, Dash, OffScale, Selector, Template, Track } from "./types.ts";

/** The default template's curve tracks, in display order. */
type DefaultCurveTrack = "gr-caliper" | "resistivity" | "density-neutron" | "sonic" | "drilling";

export interface CurveFamilyDefault {
  /** A short name for an entry that matched nothing, as in "SGR — not in this well". */
  readonly label: string;
  /** The default template's track for the family; null leaves it out (QC curves). */
  readonly track: DefaultCurveTrack | null;
  readonly scale: CurveScale;
  readonly offScale: OffScale;
  readonly style: CurveStyle;
}

function family(
  label: string,
  track: DefaultCurveTrack | null,
  [left, right, unit, type]: [number, number, string, CurveScale["type"]],
  offScale: OffScale,
  colour: string,
  dash: Dash,
): CurveFamilyDefault {
  return {
    label,
    track,
    scale: { type, ends: { kind: "fixed", left, right, unit } },
    offScale,
    style: { colour, width: 1, dash },
  };
}

const RESISTIVITY: [number, number, string, "log"] = [0.2, 2000, "ohm·m", "log"];

/** Per family, in draw order within each track. */
export const curveFamilyDefaults: Readonly<Partial<Record<CurveFamily, CurveFamilyDefault>>> = {
  "gamma-ray": family("GR", "gr-caliper", [0, 150, "gAPI", "linear"], "wrap", "#006400", "solid"),
  "spectral-gamma-ray": family("SGR", "gr-caliper", [0, 150, "gAPI", "linear"], "wrap", "#006400", "dashed"),
  caliper: family("CALI", "gr-caliper", [6, 16, "in", "linear"], "wrap", "#FF0000", "dashed"),
  "bit-size": family("BS", "gr-caliper", [6, 16, "in", "linear"], "wrap", "#000000", "dotted"),
  "differential-caliper": family("DCAL", null, [-2, 8, "in", "linear"], "clip", "#A0522D", "solid"),
  "resistivity-deep": family("RDEP", "resistivity", RESISTIVITY, "clip", "#330000", "solid"),
  "resistivity-medium": family("RMED", "resistivity", RESISTIVITY, "clip", "#CC0000", "dashed"),
  "resistivity-shallow": family("RSHA", "resistivity", RESISTIVITY, "clip", "#FF8C00", "dotted"),
  "resistivity-micro": family("RXO", "resistivity", RESISTIVITY, "clip", "#0000CC", "dashdot"),
  "bulk-density": family("RHOB", "density-neutron", [1.95, 2.95, "g/cm³", "linear"], "clip", "#FF0000", "solid"),
  "density-correction": family("DRHO", null, [-0.25, 0.25, "g/cm³", "linear"], "clip", "#808080", "dotted"),
  "neutron-porosity": family("NPHI", "density-neutron", [0.45, -0.15, "v/v", "linear"], "clip", "#0099CC", "dashed"),
  pef: family("PEF", "density-neutron", [0, 10, "b/e", "linear"], "clip", "#000000", "solid"),
  "sonic-compressional": family("DTC", "sonic", [140, 40, "µs/ft", "linear"], "wrap", "#800080", "solid"),
  "sonic-shear": family("DTS", "sonic", [440, 40, "µs/ft", "linear"], "wrap", "#FF00FF", "dashed"),
  rop: family("ROP", "drilling", [100, 0, "m/h", "linear"], "clip", "#000000", "solid"),
};

/**
 * The two families FORCE 2020 carries as mnemonic pairs. Each gets one entry
 * per mnemonic, so a well with both draws both and a well with one draws it
 * once (ADR-0003's family-skip rule).
 */
const MNEMONIC_PAIRS: Partial<Record<CurveFamily, readonly { mnemonic: string; dash?: Dash }[]>> = {
  "resistivity-micro": [{ mnemonic: "RXO" }, { mnemonic: "RMIC", dash: "dotted" }],
  rop: [{ mnemonic: "ROP" }, { mnemonic: "ROPA", dash: "dashed" }],
};

/** Track order and relative widths. The depth track sits after the first. */
const TRACKS: readonly ({ id: DefaultCurveTrack; width: number } | "depth")[] = [
  { id: "gr-caliper", width: 1 },
  "depth",
  { id: "resistivity", width: 1 },
  { id: "density-neutron", width: 1 },
  { id: "sonic", width: 1 },
  { id: "drilling", width: 0.75 },
];

function entry(id: string, defaults: CurveFamilyDefault, select: Selector[], dash?: Dash): CurveEntry {
  return {
    id,
    select,
    scale: defaults.scale,
    offScale: defaults.offScale,
    style: dash ? { ...defaults.style, dash } : defaults.style,
  };
}

function entriesFor(track: DefaultCurveTrack): CurveEntry[] {
  return Object.entries(curveFamilyDefaults).flatMap(([name, defaults]) => {
    if (defaults.track !== track) return [];
    const familySelector: Selector = { by: "family", value: name };
    const pairs = MNEMONIC_PAIRS[name as CurveFamily];
    if (!pairs) return [entry(name, defaults, [familySelector])];
    return pairs.map(({ mnemonic, dash }) =>
      entry(mnemonic.toLowerCase(), defaults, [{ by: "mnemonic", value: mnemonic }, familySelector], dash),
    );
  });
}

/** The template a well opens with. Pure: every call builds the same template. */
export function defaultTemplate(): Template {
  const tracks: Track[] = TRACKS.map((track) =>
    track === "depth"
      ? { id: "depth", kind: "depth", width: 0.5, ref: "active" }
      : { id: track.id, kind: "curve", width: track.width, curves: entriesFor(track.id) },
  );
  return { name: "Default", tracks };
}
