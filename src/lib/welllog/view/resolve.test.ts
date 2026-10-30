import { test } from "node:test";
import assert from "node:assert/strict";
import { curveFamilyOf, type Curve, type WellLog, type ZoneSet } from "../core/index.ts";
import { resolveTemplate } from "./resolve.ts";
import { defaultTemplate } from "./template/defaults.ts";
import { entryLabel } from "./template/label.ts";
import type { CurveEntry, CurveScale, Selector, Template } from "./template/types.ts";

function curve(key: string, unit = "", mnemonic = key.replace(/:\d+$/, "")): Curve {
  return {
    key,
    mnemonic,
    unit,
    description: "",
    kind: "continuous",
    family: curveFamilyOf(mnemonic, unit),
    values: new Float32Array([1, 2]),
  };
}

function wellLog(curves: Curve[], zoneSets: ZoneSet[] = []): WellLog {
  return {
    well: { id: "w", name: "W" },
    source: "test",
    depthUnit: "m",
    md: new Float64Array([100, 100.152]),
    curves,
    zoneSets,
    header: [],
    warnings: [],
  };
}

const select = (...pairs: [Selector["by"], string][]): Selector[] => pairs.map(([by, value]) => ({ by, value }));

function entry(id: string, selectors: Selector[]): CurveEntry {
  return {
    id,
    select: selectors,
    scale: { type: "linear", ends: { kind: "fixed", left: 0, right: 150, unit: "gAPI" } },
    offScale: "clip",
    style: { colour: "#006400", width: 1, dash: "solid" },
  };
}

function template(...tracks: CurveEntry[][]): Template {
  return {
    name: "Test",
    tracks: tracks.map((curves, i) => ({ id: `t${i}`, kind: "curve", width: 1, curves })),
  };
}

/** Matched curve keys per track, null where an entry matched nothing. */
function matchedKeys(t: Template, log: WellLog) {
  return resolveTemplate(t, log).tracks.map((track) => track.entries.map((e) => e.curve?.key ?? null));
}

test("the first selector that matches wins", () => {
  const log = wellLog([curve("GR", "gAPI"), curve("GR:2", "gAPI"), curve("SGR", "gAPI")]);
  const t = template([
    entry("a", select(["mnemonic", "CGR"], ["family", "spectral-gamma-ray"])),
    entry("b", select(["key", "GR:2"], ["mnemonic", "GR"], ["family", "gamma-ray"])),
    entry("c", select(["key", "GR:9"], ["mnemonic", "GR"])),
    entry("d", select(["mnemonic", "NOPE"], ["key", "NOPE"])),
  ]);
  assert.deepEqual(matchedKeys(t, log), [["SGR", "GR:2", "GR", null]]);
});

test("mnemonic selectors are case-insensitive; key selectors are exact", () => {
  const log = wellLog([curve("Gr", "gAPI"), curve("rhob", "g/cm³")]);
  const t = template([
    entry("a", select(["mnemonic", "GR"])),
    entry("b", select(["mnemonic", "RHOB"])),
    entry("c", select(["key", "gr"])),
    entry("d", select(["key", "Gr"])),
  ]);
  assert.deepEqual(matchedKeys(t, log), [["Gr", "rhob", null, "Gr"]]);
});

test("GR is chosen over GR:2, by mnemonic and by family", () => {
  const log = wellLog([curve("GR", "gAPI"), curve("GR:2", "gAPI")]);
  assert.deepEqual(matchedKeys(template([entry("a", select(["mnemonic", "gr"]))]), log), [["GR"]]);
  assert.deepEqual(matchedKeys(template([entry("a", select(["family", "gamma-ray"]))]), log), [["GR"]]);
  // A family selector beside an entry that names GR moves on to GR:2.
  const t = template([entry("a", select(["mnemonic", "GR"])), entry("b", select(["family", "gamma-ray"]))]);
  assert.deepEqual(matchedKeys(t, log), [["GR", "GR:2"]]);
});

const microPair = () => [
  entry("rxo", select(["mnemonic", "RXO"], ["family", "resistivity-micro"])),
  entry("rmic", select(["mnemonic", "RMIC"], ["family", "resistivity-micro"])),
];

test("a family selector skips a curve another entry in the track names: RMIC alone draws once", () => {
  assert.deepEqual(matchedKeys(template(microPair()), wellLog([curve("RMIC", "ohm·m")])), [[null, "RMIC"]]);
  assert.deepEqual(matchedKeys(template(microPair()), wellLog([curve("RXO", "ohm·m")])), [["RXO", null]]);
  assert.deepEqual(
    matchedKeys(template(microPair()), wellLog([curve("RMIC", "ohm·m"), curve("RXO", "ohm·m")])),
    [["RXO", "RMIC"]],
  );
});

test("the family skip looks only within the entry's own track", () => {
  const log = wellLog([curve("RMIC", "ohm·m")]);
  const t = template(microPair(), [entry("micro", select(["family", "resistivity-micro"]))]);
  assert.deepEqual(matchedKeys(t, log), [[null, "RMIC"], ["RMIC"]]);
});

test("the family skip spares curves another entry matched only by family", () => {
  // Neither entry names a curve here, so both fall back on the one micro curve.
  const log = wellLog([curve("MSFL", "ohm·m")]);
  assert.deepEqual(matchedKeys(template(microPair()), log), [["MSFL", "MSFL"]]);
});

test("two entries may show the same curve", () => {
  const log = wellLog([curve("GR", "gAPI")]);
  const t = template([entry("near", select(["mnemonic", "GR"])), entry("far", select(["key", "GR"]))]);
  const [track] = resolveTemplate(t, log).tracks;
  assert.equal(track.entries[0].curve, track.entries[1].curve);
  assert.deepEqual(resolveTemplate(t, log).unmatchedCurves, []);
});

test("it lists the unmatched entries and the curves nothing shows", () => {
  const log = wellLog([curve("GR", "gAPI"), curve("FOO"), curve("SP", "mV")]);
  const t = template([entry("gr", select(["family", "gamma-ray"])), entry("rop", select(["mnemonic", "ROP"]))], [
    entry("dtc", select(["family", "sonic-compressional"])),
  ]);
  const resolved = resolveTemplate(t, log);
  assert.deepEqual(
    resolved.unmatchedEntries.map(({ trackId, entry }) => [trackId, entry.id]),
    [
      ["t0", "rop"],
      ["t1", "dtc"],
    ],
  );
  assert.deepEqual(
    resolved.unmatchedCurves.map((c) => c.key),
    ["FOO", "SP"],
  );
});

test("a matched entry gets its fixed curve scale; an unmatched one gets none", () => {
  const log = wellLog([curve("GR", "gAPI")]);
  const t = template([entry("gr", select(["mnemonic", "GR"])), entry("x", select(["mnemonic", "X"]))]);
  const [track] = resolveTemplate(t, log).tracks;
  assert.ok(track.kind === "curve");
  assert.deepEqual(track.entries[0].scale, { left: 0, right: 150, type: "linear" });
  assert.equal(track.entries[1].scale, null);
});

test("a curve track's gridlines follow its first entry, matched or not", () => {
  const log = wellLog([curve("GR", "gAPI")]);
  const res: CurveEntry = {
    ...entry("rdep", select(["family", "resistivity-deep"])),
    scale: { type: "log", ends: { kind: "fixed", left: 0.2, right: 2000, unit: "ohm·m" } },
  };
  const [track] = resolveTemplate(template([res, entry("gr", select(["mnemonic", "GR"]))]), log).tracks;
  assert.equal(track.kind, "curve");
  assert.deepEqual(track.kind === "curve" && track.grid, { left: 0.2, right: 2000, type: "log" });
  const [empty] = resolveTemplate(template([res]), wellLog([])).tracks;
  assert.deepEqual(empty.kind === "curve" && empty.grid, { left: 0.2, right: 2000, type: "log" });
});

/** A well log of one curve with these values, at 1 m steps. */
function oneCurve(mnemonic: string, unit: string, values: number[]): WellLog {
  return {
    ...wellLog([{ ...curve(mnemonic, unit), values: new Float32Array(values) }]),
    md: Float64Array.from(values, (_, i) => 1000 + i),
  };
}

/** The resolved scale of a one-entry track with this scale against `log`. */
function scaleOn(scale: CurveScale, log: WellLog): { left: number; right: number; type: string } {
  const e: CurveEntry = { ...entry("e", select(["key", log.curves[0].key])), scale };
  const [track] = resolveTemplate(template([e]), log).tracks;
  assert.ok(track.kind === "curve" && track.entries[0].scale);
  return track.entries[0].scale;
}

const nearScale = (actual: { left: number; right: number }, left: number, right: number) => {
  assert.ok(Math.abs(actual.left - left) < 1e-6 * Math.max(1, Math.abs(left)), `left ${actual.left} ≉ ${left}`);
  assert.ok(Math.abs(actual.right - right) < 1e-6 * Math.max(1, Math.abs(right)), `right ${actual.right} ≉ ${right}`);
};

/** 1 … 101: the median is 51, and percentile p sits on p + 1. */
const ONE_TO_101 = Array.from({ length: 101 }, (_, i) => i + 1);

test("centredOnMedian: a window of its width on the curve's median", () => {
  const sp: CurveScale = { type: "linear", ends: { kind: "centredOnMedian", width: 100, reversed: false } };
  nearScale(scaleOn(sp, oneCurve("SP", "mV", [-80, -70, -60, NaN, -20, -75])), -120, -20);
  nearScale(scaleOn(sp, oneCurve("SP", "mV", ONE_TO_101)), 1, 101);
});

test("percentile: the curve's lo and hi percentiles, missing values left out", () => {
  const p: CurveScale = { type: "linear", ends: { kind: "percentile", lo: 1, hi: 99, reversed: false } };
  nearScale(scaleOn(p, oneCurve("MUDWEIGHT", "g/cm³", [...ONE_TO_101, NaN, NaN])), 2, 100);
  const p10: CurveScale = { type: "linear", ends: { kind: "percentile", lo: 10, hi: 90, reversed: false } };
  // Between ranks it interpolates: 10 % of the way from 1 to 11 is 2.
  nearScale(scaleOn(p10, oneCurve("X", "", [1, 11, 21, 31, 41, 51, 61, 71, 81, 91, 101])), 11, 91);
});

test("percentile on a log scale is computed on log10", () => {
  // log10: 0 … 4 in 401 even steps, so percentile p sits on 10^(p / 25).
  const values = Array.from({ length: 401 }, (_, i) => 10 ** (i / 100));
  const p: CurveScale = { type: "log", ends: { kind: "percentile", lo: 25, hi: 75, reversed: false } };
  const scale = scaleOn(p, oneCurve("RT", "ohm·m", [...values, 0, -1]));
  nearScale(scale, 10, 1000);
  assert.equal(scale.type, "log");
  // The median of log10 values (1.5), not the log10 of the values' median (log10 55 ≈ 1.74);
  // the width is in decades.
  const c: CurveScale = { type: "log", ends: { kind: "centredOnMedian", width: 2, reversed: false } };
  nearScale(scaleOn(c, oneCurve("RT", "ohm·m", [1, 10, 100, 1000])), 10 ** 0.5, 10 ** 2.5);
});

test("computed ends keep the scale's direction", () => {
  const log = oneCurve("X", "", ONE_TO_101);
  nearScale(scaleOn({ type: "linear", ends: { kind: "percentile", lo: 1, hi: 99, reversed: true } }, log), 100, 2);
  nearScale(scaleOn({ type: "linear", ends: { kind: "centredOnMedian", width: 10, reversed: true } }, log), 56, 46);
  // The unit fallback follows the fixed ends' own direction (NPHI runs 0.45 → −0.15).
  const nphi: CurveScale = { type: "linear", ends: { kind: "fixed", left: 0.45, right: -0.15, unit: "v/v" } };
  nearScale(scaleOn(nphi, oneCurve("NPHI", "furlongs", ONE_TO_101)), 100, 2);
});

test("computed ends come from the whole well, whatever is in view", () => {
  // The view is not an input: resolving against the whole well log is the only way to get a scale.
  const log = oneCurve("SP", "mV", [...Array(50).fill(-100), ...Array(51).fill(20)]);
  const sp: CurveScale = { type: "linear", ends: { kind: "centredOnMedian", width: 100, reversed: false } };
  nearScale(scaleOn(sp, log), -30, 70);
});

test("a constant curve still gets a scale with width", () => {
  const p: CurveScale = { type: "linear", ends: { kind: "percentile", lo: 1, hi: 99, reversed: false } };
  const scale = scaleOn(p, oneCurve("X", "", [2, 2, 2]));
  assert.ok(scale.left < 2 && scale.right > 2, `${scale.left}–${scale.right}`);
});

test("fixed ends convert into the curve's unit, in both directions of each pair", () => {
  const cases: [string, number, number, string, number, number][] = [
    ["in", 6, 16, "mm", 152.4, 406.4],
    ["mm", 152.4, 406.4, "in", 6, 16],
    ["g/cm³", 1.95, 2.95, "kg/m³", 1950, 2950],
    ["kg/m3", 1950, 2950, "G/C3", 1.95, 2.95],
    ["v/v", 0.45, -0.15, "%", 45, -15],
    ["v/v", 0.45, -0.15, "p.u.", 45, -15],
    ["PU", 45, -15, "V/V", 0.45, -0.15],
    ["%", 45, -15, "dec", 0.45, -0.15],
    ["µs/ft", 140, 40, "us/m", 140 / 0.3048, 40 / 0.3048],
    ["us/m", 459.3, 131.2, "US/F", 459.3 * 0.3048, 131.2 * 0.3048],
    ["m/h", 100, 0, "ft/h", 100 / 0.3048, 0],
    ["ft/hr", 328, 0, "M/HR", 328 * 0.3048, 0],
  ];
  for (const [from, left, right, to, l, r] of cases) {
    const scale: CurveScale = { type: "linear", ends: { kind: "fixed", left, right, unit: from } };
    nearScale(scaleOn(scale, oneCurve("X", to, ONE_TO_101)), l, r);
  }
});

test("fixed ends are taken as written when the units agree however they are spelled", () => {
  const res: CurveScale = { type: "log", ends: { kind: "fixed", left: 0.2, right: 2000, unit: "ohm·m" } };
  for (const unit of ["ohm·m", "OHMM", "ohm.m", "Ohm-m"]) nearScale(scaleOn(res, oneCurve("ILD", unit, [1])), 0.2, 2000);
  const gr: CurveScale = { type: "linear", ends: { kind: "fixed", left: 0, right: 150, unit: "gAPI" } };
  for (const unit of ["gAPI", "GAPI", "API"]) nearScale(scaleOn(gr, oneCurve("GR", unit, [1])), 0, 150);
  const blank: CurveScale = { type: "linear", ends: { kind: "fixed", left: 0, right: 10, unit: "" } };
  nearScale(scaleOn(blank, oneCurve("X", "", [50])), 0, 10);
});

test("fixed ends in a unit with no known factor, or against a blank unit, fall back on percentile [1, 99]", () => {
  const rhob: CurveScale = { type: "linear", ends: { kind: "fixed", left: 1.95, right: 2.95, unit: "g/cm³" } };
  nearScale(scaleOn(rhob, oneCurve("MUDWEIGHT", "", ONE_TO_101)), 2, 100);
  nearScale(scaleOn(rhob, oneCurve("RHOB", "lb/ft3", ONE_TO_101)), 2, 100);
  // A known unit of another quantity has no factor either.
  nearScale(scaleOn(rhob, oneCurve("RHOB", "in", ONE_TO_101)), 2, 100);
  // On a log scale the fallback is taken on log10.
  const res: CurveScale = { type: "log", ends: { kind: "fixed", left: 0.2, right: 2000, unit: "ohm·m" } };
  const values = Array.from({ length: 401 }, (_, i) => 10 ** (i / 100));
  nearScale(scaleOn(res, oneCurve("RT", "mS/m", values)), 10 ** 0.04, 10 ** 3.96);
});

test("a track whose first entry has computed ends grids from its curve, or evenly when unmatched", () => {
  const sp: CurveEntry = {
    ...entry("sp", select(["family", "sp"])),
    scale: { type: "linear", ends: { kind: "centredOnMedian", width: 100, reversed: false } },
  };
  const [track] = resolveTemplate(template([sp]), oneCurve("SP", "mV", [10, 20, 30])).tracks;
  assert.deepEqual(track.kind === "curve" && track.grid, { left: -30, right: 70, type: "linear" });
  const [empty] = resolveTemplate(template([sp]), wellLog([])).tracks;
  assert.deepEqual(empty.kind === "curve" && empty.grid, { left: 0, right: 1, type: "linear" });
  const logScale: CurveEntry = { ...sp, scale: { ...sp.scale, type: "log" } };
  const [none] = resolveTemplate(template([logScale]), wellLog([])).tracks;
  assert.equal(none.kind === "curve" && none.grid, null);
});

const FORCE_COLUMNS: [string, string][] = [
  ["CALI", "in"],
  ["RSHA", "ohm·m"],
  ["RMED", "ohm·m"],
  ["RDEP", "ohm·m"],
  ["RHOB", "g/cm³"],
  ["GR", "gAPI"],
  ["SGR", "gAPI"],
  ["NPHI", "v/v"],
  ["PEF", "b/e"],
  ["DTC", "µs/ft"],
  ["SP", "mV"],
  ["BS", "in"],
  ["ROP", "m/h"],
  ["DTS", "µs/ft"],
  ["DCAL", "in"],
  ["DRHO", "g/cm³"],
  ["MUDWEIGHT", "g/cm³"],
  ["RMIC", "ohm·m"],
  ["ROPA", "m/h"],
  ["RXO", "ohm·m"],
];

const lithology: Curve = {
  ...curve("FORCE_2020_LITHOFACIES_LITHOLOGY", "code"),
  kind: "discrete",
};

/** Matched curve keys per default template track, by track id. */
function defaultMatches(log: WellLog) {
  return Object.fromEntries(
    resolveTemplate(defaultTemplate(), log).tracks.map((t) => [t.track.id, t.entries.map((e) => e.curve?.key ?? null)]),
  );
}

test("the default template on a FORCE-shaped well log", () => {
  const log = wellLog([...FORCE_COLUMNS.map(([name, unit]) => curve(name, unit)), lithology]);
  assert.deepEqual(defaultMatches(log), {
    "gr-caliper": ["GR", "SGR", "SP", "CALI", "BS"],
    depth: [],
    resistivity: ["RDEP", "RMED", "RSHA", "RXO", "RMIC", null],
    "density-neutron": ["RHOB", "NPHI", "PEF"],
    sonic: ["DTC", "DTS"],
    drilling: ["ROP", "ROPA", "MUDWEIGHT"],
    lithology: ["FORCE_2020_LITHOFACIES_LITHOLOGY"],
    group: [],
    formation: [],
  });
  // The QC curves are left to the picker.
  assert.deepEqual(
    resolveTemplate(defaultTemplate(), log).unmatchedCurves.map((c) => c.key),
    ["DCAL", "DRHO"],
  );
});

test("a FORCE 2020 well with no drilling curves keeps its drilling track, empty", () => {
  const log = wellLog(
    FORCE_COLUMNS.filter(([name]) => !["ROP", "ROPA", "MUDWEIGHT"].includes(name)).map(([name, unit]) =>
      curve(name, unit),
    ),
  );
  const resolved = resolveTemplate(defaultTemplate(), log);
  assert.deepEqual(
    resolved.tracks.map((t) => t.track.id),
    ["gr-caliper", "depth", "resistivity", "density-neutron", "sonic", "drilling", "lithology", "group", "formation"],
  );
  const drilling = resolved.tracks.find((t) => t.track.id === "drilling")!;
  assert.deepEqual(
    drilling.entries.map((e) => [entryLabel(e.entry), e.curve]),
    [
      ["ROP", null],
      ["ROPA", null],
      ["MW", null],
    ],
  );
});

test("the default template on a LAS-shaped well log matches by curve family", () => {
  const log = wellLog([
    curve("GR", "GAPI"),
    curve("CALI", "IN"),
    curve("ILD", "OHMM"),
    curve("ILM", "OHMM"),
    curve("SFLU", "OHMM"),
    curve("RHOB", "G/C3"),
    curve("NPHI", "V/V"),
    curve("DT", "US/F"),
    curve("SP", "MV"),
    curve("RES1", "OHMM"),
    curve("TENS", "LBF"),
  ]);
  assert.deepEqual(defaultMatches(log), {
    "gr-caliper": ["GR", null, "SP", "CALI", null],
    depth: [],
    resistivity: ["ILD", "ILM", "SFLU", null, null, "RES1"],
    "density-neutron": ["RHOB", "NPHI", null],
    sonic: ["DT", null],
    drilling: [null, null, null],
    lithology: [null],
    group: [],
    formation: [],
  });
  assert.deepEqual(
    resolveTemplate(defaultTemplate(), log).unmatchedCurves.map((c) => c.key),
    ["TENS"],
  );
});

test("the default template's fixed ends take LAS spellings of FORCE 2020 units as written", () => {
  const log = wellLog([curve("CALI", "IN"), curve("RHOB", "G/C3"), curve("NPHI", "V/V"), curve("DT", "US/F")]);
  const scales = resolveTemplate(defaultTemplate(), log)
    .tracks.flatMap((t) => (t.kind === "curve" ? t.entries : []))
    .flatMap(({ curve, scale }) => (curve && scale ? [[curve.key, scale.left, scale.right]] : []));
  assert.deepEqual(scales, [
    ["CALI", 6, 16],
    ["RHOB", 1.95, 2.95],
    ["NPHI", 0.45, -0.15],
    ["DT", 140, 40],
  ]);
});

test("an entry's label is its key, else its mnemonic, else its family's short name", () => {
  assert.equal(entryLabel(entry("a", select(["key", "GR:2"], ["mnemonic", "GR"], ["family", "gamma-ray"]))), "GR:2");
  assert.equal(entryLabel(entry("a", select(["mnemonic", "ROPA"], ["family", "rop"]))), "ROPA");
  assert.equal(entryLabel(entry("a", select(["family", "spectral-gamma-ray"]))), "SGR");
  assert.equal(entryLabel(entry("a", select(["family", "no-such-family"]))), "no-such-family");
  assert.equal(entryLabel(entry("gr-2", [])), "gr-2");
});

const zoneSet = (name: string, ...names: string[]): ZoneSet => ({
  name,
  zones: names.map((zone, i) => ({ name: zone, top: 100 + i, base: 101 + i })),
});

test("the default template's zone tracks show the FORCE 2020 zone sets by name", () => {
  const log = wellLog([lithology], [zoneSet("GROUP", "VIKING GP.", "BAAT GP."), zoneSet("FORMATION", "Ness Fm.")]);
  const resolved = resolveTemplate(defaultTemplate(), log);
  const zones = resolved.tracks.flatMap((t) => (t.kind === "zone" ? [[t.track.id, t.zoneSet?.zones.map((z) => z.name)]] : []));
  assert.deepEqual(zones, [
    ["group", ["VIKING GP.", "BAAT GP."]],
    ["formation", ["Ness Fm."]],
  ]);
  assert.deepEqual(resolved.unmatchedZoneSets, []);
  const group = resolved.tracks.find((t) => t.kind === "zone")!;
  assert.ok(group.kind === "zone");
  assert.equal(group.colours.length, 2);
  assert.equal(group.labelInks.length, 2);
});

test("a LAS-shaped well log with no zone sets keeps its zone tracks, flagged as unmatched", () => {
  const log = wellLog([curve("GR", "GAPI"), curve("ILD", "OHMM")]);
  const resolved = resolveTemplate(defaultTemplate(), log);
  assert.deepEqual(
    resolved.tracks.slice(-3).map((t) => [t.track.id, t.kind]),
    [
      ["lithology", "discrete"],
      ["group", "zone"],
      ["formation", "zone"],
    ],
  );
  for (const track of resolved.tracks) if (track.kind === "zone") assert.equal(track.zoneSet, null);
  assert.deepEqual(resolved.unmatchedZoneSets, [
    { trackId: "group", zoneSet: "GROUP" },
    { trackId: "formation", zoneSet: "FORMATION" },
  ]);
  // The lithology entry is unmatched too, and keeps its track.
  assert.ok(resolved.unmatchedEntries.some(({ trackId, entry }) => trackId === "lithology" && entry.id === "lithology"));
});

test("zone sets match by their exact name", () => {
  const t: Template = { name: "Z", tracks: [{ id: "z", kind: "zone", width: 0.6, zoneSet: "GROUP" }] };
  const [track] = resolveTemplate(t, wellLog([], [zoneSet("Group", "A")])).tracks;
  assert.ok(track.kind === "zone" && track.zoneSet === null);
});

test("a discrete entry matches discrete curves only, and a curve entry continuous ones only", () => {
  const continuousLith = { ...curve("LITH"), family: "lithology" as const };
  const discreteLith: Curve = { ...curve("LITH:2"), family: "lithology", kind: "discrete" };
  const t: Template = {
    name: "D",
    tracks: [
      { id: "d", kind: "discrete", width: 0.4, curve: { id: "lith", select: select(["family", "lithology"]) } },
      { id: "c", kind: "curve", width: 1, curves: [entry("lith-line", select(["family", "lithology"]))] },
    ],
  };
  assert.deepEqual(matchedKeys(t, wellLog([continuousLith, discreteLith])), [["LITH:2"], ["LITH"]]);
  assert.deepEqual(matchedKeys(t, wellLog([continuousLith])), [[null], ["LITH"]]);
});

test("a discrete track resolves a style for every code in its curve", () => {
  const lith: Curve = { ...lithology, values: Float32Array.from([65000, 90000, NaN, 4]) };
  const [track] = resolveTemplate(
    { name: "D", tracks: [defaultTemplate().tracks.find((t) => t.kind === "discrete")!] },
    wellLog([lith]),
  ).tracks;
  assert.ok(track.kind === "discrete");
  assert.deepEqual([...track.styles.keys()].sort((a, b) => a - b), [4, 65000, 90000]);
  assert.equal(track.styles.get(4)?.pattern, undefined);
});
