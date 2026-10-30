import { test } from "node:test";
import assert from "node:assert/strict";
import { curveFamilyOf, type Curve, type WellLog } from "../core/index.ts";
import { GAP, NO_VALUE } from "./format.ts";
import { cardGroups, isGapRow, readoutAt } from "./readout.ts";
import { resolveTemplate } from "./resolve.ts";
import type { CurveEntry, Template } from "./template/types.ts";

function continuous(mnemonic: string, unit: string, values: number[]): Curve {
  return {
    key: mnemonic,
    mnemonic,
    unit,
    description: "",
    kind: "continuous",
    family: curveFamilyOf(mnemonic, unit),
    values: Float32Array.from(values),
  };
}

// Row 1: GR has no value, RHOB has one. Row 2: no curve has a value (a gap).
const LITH: Curve = {
  key: "FORCE_2020_LITHOFACIES_LITHOLOGY",
  mnemonic: "FORCE_2020_LITHOFACIES_LITHOLOGY",
  unit: "",
  description: "",
  kind: "discrete",
  family: "lithology",
  values: Float32Array.from([65000, 65000, NaN, 99999]),
  codes: { "65000": "Shale" },
};

const LOG: WellLog = {
  well: { id: "w", name: "W" },
  source: "test",
  depthUnit: "m",
  md: new Float64Array([100, 100.5, 101, 101.5]),
  tvdss: new Float64Array([NaN, 80, 80.5, 81]),
  curves: [continuous("GR", "gAPI", [85.123, NaN, NaN, 10011.3]), continuous("RHOB", "g/cm3", [2.3, 2.4, NaN, -7429]), LITH],
  zoneSets: [
    { name: "GROUP", zones: [{ name: "Nordland Gp.", top: 100, base: 101.5 }] },
    { name: "FORMATION", zones: [{ name: "Utsira Fm.", top: 100.5, base: 101.5 }] },
  ],
  header: [],
  warnings: [],
};

function entry(id: string, mnemonic: string): CurveEntry {
  return {
    id,
    select: [{ by: "mnemonic", value: mnemonic }],
    scale: { type: "linear", ends: { kind: "fixed", left: 0, right: 150, unit: "gAPI" } },
    offScale: "clip",
    style: { colour: "#006400", width: 1, dash: "solid" },
  };
}

const TEMPLATE: Template = {
  name: "Test",
  tracks: [
    { id: "depth", kind: "depth", width: 0.5, ref: "active" },
    { id: "tvd", kind: "depth", width: 0.5, ref: "tvdss" },
    { id: "curves", kind: "curve", width: 1, curves: [entry("gr", "GR"), entry("sgr", "SGR"), entry("rhob", "RHOB")] },
    { id: "lith", kind: "discrete", width: 0.4, curve: { id: "lith", select: [{ by: "family", value: "lithology" }] } },
    { id: "group", kind: "zone", width: 0.6, zoneSet: "GROUP" },
    { id: "missing", kind: "zone", width: 0.6, zoneSet: "NOPE" },
  ],
};

const read = (md: number, log = LOG) => readoutAt(log, resolveTemplate(TEMPLATE, log).tracks, md, "md");

test("each track reads its value at the depth: curves per entry, depth, lithology label and zone name", () => {
  const at = read(100.2);
  assert.equal(at.gap, false);
  assert.deepEqual(Object.fromEntries(at.tracks), {
    depth: ["100.2"],
    tvd: [NO_VALUE],
    curves: ["85.12", null, "2.3"],
    lith: ["Shale"],
    group: ["Nordland Gp."],
    missing: [null],
  });
});

test("a curve with no value at the depth reads —, while the others read theirs", () => {
  const at = read(100.7);
  assert.equal(at.gap, false);
  assert.deepEqual(at.tracks.get("curves"), [NO_VALUE, null, "2.4"]);
  assert.deepEqual(at.tracks.get("tvd"), ["80.2"]);
});

test("inside a gap every curve and the lithology read gap; depth and zones still read", () => {
  const at = read(101.2);
  assert.equal(at.gap, true);
  assert.deepEqual(at.tracks.get("curves"), [GAP, null, GAP]);
  assert.deepEqual(at.tracks.get("lith"), [GAP]);
  assert.deepEqual(at.tracks.get("depth"), ["101.2"]);
  assert.deepEqual(at.tracks.get("group"), ["Nordland Gp."]);
});

test("off-scale and implausible values read as recorded; a code without a label reads as its code", () => {
  const at = read(101.5);
  assert.deepEqual(at.tracks.get("curves"), ["10011", null, "-7429"]);
  assert.deepEqual(at.tracks.get("lith"), ["99999"]);
});

test("the active depth track follows the view's depth reference", () => {
  const tracks = resolveTemplate(TEMPLATE, LOG).tracks;
  assert.deepEqual(readoutAt(LOG, tracks, 100.7, "tvdss").tracks.get("depth"), ["80.2"]);
});

test("outside the well log nothing has a value, and it isn't a gap", () => {
  const at = read(99);
  assert.equal(at.gap, false);
  assert.deepEqual(at.tracks.get("curves"), [NO_VALUE, null, NO_VALUE]);
  assert.deepEqual(at.tracks.get("lith"), [NO_VALUE]);
});

test("a well log without TVDSS reads TVDSS as — and NaN", () => {
  const { tvdss: _, ...noTvdss } = LOG;
  const at = read(100.2, noTvdss);
  assert.deepEqual(at.tracks.get("tvd"), [NO_VALUE]);
  assert.ok(Number.isNaN(at.tvdss));
});

test("a gap row is one where no curve, continuous or discrete, has a value", () => {
  assert.deepEqual([0, 1, 2, 3].map((row) => isGapRow(LOG, row)), [false, false, true, false]);
  assert.equal(isGapRow(LOG, -1), false);
});

test("the card lists MD and TVDSS, each curve track's curves, the lithology and every zone set", () => {
  const tracks = resolveTemplate(TEMPLATE, LOG).tracks;
  const groups = cardGroups(LOG, tracks, readoutAt(LOG, tracks, 100.7, "md"));
  assert.deepEqual(groups, [
    [
      { label: "MD", value: "100.7", unit: "m" },
      { label: "TVDSS", value: "80.2", unit: "m" },
    ],
    [
      { label: "GR", value: NO_VALUE, unit: "gAPI", colour: "#006400" },
      { label: "RHOB", value: "2.4", unit: "g/cm3", colour: "#006400" },
    ],
    [{ label: "Lithology", value: "Shale" }],
    [
      { label: "GROUP", value: "Nordland Gp." },
      { label: "FORMATION", value: "Utsira Fm." },
    ],
  ]);
});

test("the card keeps the lithology and zone sets with no track showing them, and leaves out TVDSS without it", () => {
  const { tvdss: _, ...noTvdss } = LOG;
  const curvesOnly: Template = { name: "Curves", tracks: [TEMPLATE.tracks[2]] };
  const tracks = resolveTemplate(curvesOnly, noTvdss).tracks;
  const groups = cardGroups(noTvdss, tracks, readoutAt(noTvdss, tracks, 101.2, "md"));
  assert.deepEqual(groups[0], [{ label: "MD", value: "101.2", unit: "m" }]);
  assert.deepEqual(groups.slice(1).map((g) => g.map((row) => row.value)), [[GAP, GAP], [GAP], ["Nordland Gp.", "Utsira Fm."]]);
});
