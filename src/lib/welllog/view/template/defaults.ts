/**
 * Curve family display defaults, and the default template built from them
 * (#29). Values come from the curve family defaults note
 * (docs/research/curve-family-defaults.md on the research/curve-family-defaults
 * branch) and #29's resolution; colours are written for a light background
 * (ADR-0006).
 */

import type { CurveFamily } from "../../core/index.ts";
import { FALLBACK_PERCENTILES } from "../scaleEnds.ts";
import type {
  CodeStyle,
  CurveEntry,
  CurveScale,
  CurveStyle,
  Dash,
  Fill,
  OffScale,
  ScaleType,
  Selector,
  Template,
  Track,
} from "./types.ts";

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
  scale: CurveScale,
  offScale: OffScale,
  colour: string,
  dash: Dash,
): CurveFamilyDefault {
  return { label, track, scale, offScale, style: { colour, width: 1, dash } };
}

const fixed = (left: number, right: number, unit: string, type: ScaleType = "linear"): CurveScale => ({
  type,
  ends: { kind: "fixed", left, right, unit },
});

/** Where a family has no safe fixed scale: mud weight's mixed magnitudes, `unknown`. */
const PERCENTILE_1_99: CurveScale = { type: "linear", ends: { kind: "percentile", ...FALLBACK_PERCENTILES, reversed: false } };

/** SP is relative, so it gets a 100 mV window on its median, negative to the left. */
const SP: CurveScale = { type: "linear", ends: { kind: "centredOnMedian", width: 100, reversed: false } };

const RESISTIVITY = fixed(0.2, 2000, "ohm·m", "log");

/** The continuous curve families; lithology is discrete (see discreteFamilyDefaults). */
export type ContinuousFamily = Exclude<CurveFamily, "lithology">;

/** Per family, in draw order within each track. */
export const curveFamilyDefaults: Readonly<Record<ContinuousFamily, CurveFamilyDefault>> = {
  "gamma-ray": family("GR", "gr-caliper", fixed(0, 150, "gAPI"), "wrap", "#006400", "solid"),
  "spectral-gamma-ray": family("SGR", "gr-caliper", fixed(0, 150, "gAPI"), "wrap", "#006400", "dashed"),
  sp: family("SP", "gr-caliper", SP, "clip", "#0000FF", "solid"),
  caliper: family("CALI", "gr-caliper", fixed(6, 16, "in"), "wrap", "#FF0000", "dashed"),
  "bit-size": family("BS", "gr-caliper", fixed(6, 16, "in"), "wrap", "#000000", "dotted"),
  "differential-caliper": family("DCAL", null, fixed(-2, 8, "in"), "clip", "#A0522D", "solid"),
  "resistivity-deep": family("RDEP", "resistivity", RESISTIVITY, "clip", "#330000", "solid"),
  "resistivity-medium": family("RMED", "resistivity", RESISTIVITY, "clip", "#CC0000", "dashed"),
  "resistivity-shallow": family("RSHA", "resistivity", RESISTIVITY, "clip", "#FF8C00", "dotted"),
  "resistivity-micro": family("RXO", "resistivity", RESISTIVITY, "clip", "#0000CC", "dashdot"),
  "resistivity-unknown-depth": family("RES", "resistivity", RESISTIVITY, "clip", "#808080", "solid"),
  "bulk-density": family("RHOB", "density-neutron", fixed(1.95, 2.95, "g/cm³"), "clip", "#FF0000", "solid"),
  "density-correction": family("DRHO", null, fixed(-0.25, 0.25, "g/cm³"), "clip", "#808080", "dotted"),
  "neutron-porosity": family("NPHI", "density-neutron", fixed(0.45, -0.15, "v/v"), "clip", "#0099CC", "dashed"),
  pef: family("PEF", "density-neutron", fixed(0, 10, "b/e"), "clip", "#000000", "solid"),
  "sonic-compressional": family("DTC", "sonic", fixed(140, 40, "µs/ft"), "wrap", "#800080", "solid"),
  "sonic-shear": family("DTS", "sonic", fixed(440, 40, "µs/ft"), "wrap", "#FF00FF", "dashed"),
  rop: family("ROP", "drilling", fixed(100, 0, "m/h"), "clip", "#000000", "solid"),
  "mud-weight": family("MW", "drilling", PERCENTILE_1_99, "clip", "#8B4513", "solid"),
  // Not in the default template, so an unknown curve counts as not shown.
  unknown: family("Unknown", null, PERCENTILE_1_99, "clip", "#808080", "solid"),
};

export interface DiscreteFamilyDefault {
  /** A short name for the family: the discrete track's header, struck through when nothing matches. */
  readonly label: string;
  /** Code (as a string) → style. Codes not listed take a hashed colour and no pattern. */
  readonly codes: Readonly<Record<string, CodeStyle>>;
}

/**
 * Discrete curve families. Lithology uses the Kansas Geological Survey
 * colours with FGDC pattern numbers, for every FORCE 2020 code. Limestone
 * and chalk share a colour and differ by pattern. FGDC has no anhydrite
 * pattern, so it takes 667 (gypsum), the nearest evaporite. Basement takes
 * intrusive igneous rock (718), a guess for crystalline basement.
 */
export const discreteFamilyDefaults: Readonly<Partial<Record<CurveFamily, DiscreteFamilyDefault>>> = {
  lithology: {
    label: "Lithology",
    codes: {
      "30000": { colour: "#FFFF00", pattern: 607 }, // sandstone
      "65030": { colour: "#FFE119", pattern: 670 }, // sandstone/shale
      "65000": { colour: "#BEBEBE", pattern: 620 }, // shale
      "80000": { colour: "#7CFC00", pattern: 623 }, // marl
      "74000": { colour: "#8080FF", pattern: 642 }, // dolomite
      "70000": { colour: "#80FFFF", pattern: 627 }, // limestone
      "70032": { colour: "#80FFFF", pattern: 626 }, // chalk
      "88000": { colour: "#7FFFD4", pattern: 668 }, // halite
      "86000": { colour: "#FF80FF", pattern: 667 }, // anhydrite
      "99000": { colour: "#FF8C00", pattern: 711 }, // tuff
      "90000": { colour: "#000000", pattern: 658 }, // coal
      "93000": { colour: "#FF1493", pattern: 718 }, // basement
    },
  },
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

/** About 40% alpha, so curves and gridlines read through a fill. */
const FILL_ALPHA = "66";

const curveBoundary = (id: string) => ({ kind: "curve", id }) as const;

/**
 * The fills that are on (#29). The resistivity and PEF cut-offs need a value
 * chosen per well, so they stay off. Each GR fill has only one side that can
 * occur (GR never passes an edge), so the other is transparent.
 */
const FILLS: Partial<Record<DefaultCurveTrack, readonly Fill[]>> = {
  "gr-caliper": [
    {
      id: "gr-sand",
      a: curveBoundary("gamma-ray"),
      b: { kind: "edge", edge: "right" },
      colourWhereALeft: `#FFFF00${FILL_ALPHA}`,
      colourWhereARight: "#00000000",
    },
    {
      id: "gr-shale",
      a: { kind: "edge", edge: "left" },
      b: curveBoundary("gamma-ray"),
      colourWhereALeft: `#BEBEBE${FILL_ALPHA}`,
      colourWhereARight: "#00000000",
    },
    {
      // Caliper and bit size share a scale, so larger is further right.
      id: "caliper-bit-size",
      a: curveBoundary("caliper"),
      b: curveBoundary("bit-size"),
      colourWhereALeft: `#8FBC8F${FILL_ALPHA}`,
      colourWhereARight: `#FFA500${FILL_ALPHA}`,
    },
  ],
  "density-neutron": [
    {
      id: "density-neutron-crossover",
      a: curveBoundary("bulk-density"),
      b: curveBoundary("neutron-porosity"),
      colourWhereALeft: `#FFFF00${FILL_ALPHA}`,
      colourWhereARight: `#BEBEBE${FILL_ALPHA}`,
    },
  ],
};

/** After the curve tracks: lithology, then the two FORCE 2020 zone sets. */
const DISCRETE_AND_ZONE_TRACKS: readonly Track[] = [
  { id: "lithology", kind: "discrete", width: 0.4, curve: { id: "lithology", select: [{ by: "family", value: "lithology" }] } },
  { id: "group", kind: "zone", width: 0.6, zoneSet: "GROUP" },
  { id: "formation", kind: "zone", width: 0.6, zoneSet: "FORMATION" },
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
      : {
          id: track.id,
          kind: "curve",
          width: track.width,
          curves: entriesFor(track.id),
          ...(FILLS[track.id] && { fills: FILLS[track.id] }),
        },
  );
  return { name: "Default", tracks: [...tracks, ...DISCRETE_AND_ZONE_TRACKS] };
}
