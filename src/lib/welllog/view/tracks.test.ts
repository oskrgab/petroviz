import { test } from "node:test";
import assert from "node:assert/strict";
import { curveFamilyOf, type Curve, type WellLog } from "../core/index.ts";
import { resolveTemplate } from "./resolve.ts";
import { defaultTemplate } from "./template/defaults.ts";
import { editTemplate, newCurveTrack, newDepthTrack } from "./template/edit.ts";
import { boundaryLabel, fillLabel, trackSummary } from "./tracks.ts";
import type { ResolvedCurveTrack } from "./kinds/index.ts";

function curve(key: string, unit = ""): Curve {
  return {
    key,
    mnemonic: key,
    unit,
    description: "",
    kind: "continuous",
    family: curveFamilyOf(key, unit),
    values: new Float32Array([1, 2]),
  };
}

const lith: Curve = { ...curve("LITH"), kind: "discrete", family: "lithology" };

function wellLog(curves: Curve[]): WellLog {
  return {
    well: { id: "w", name: "W" },
    source: "test",
    depthUnit: "m",
    md: new Float64Array([100, 101]),
    curves,
    zoneSets: [{ name: "GROUP", zones: [{ name: "A", top: 100, base: 101 }] }],
    header: [],
    warnings: [],
  };
}

test("each track is summed up by its kind and what it shows in this well log", () => {
  let t = defaultTemplate();
  t = editTemplate(t, { kind: "add-track", track: newCurveTrack(t) });
  t = editTemplate(t, { kind: "add-track", track: newDepthTrack(t, "tvdss") });
  const log = wellLog([curve("GR", "gAPI"), curve("CALI", "in"), curve("RDEP", "ohm.m"), lith]);
  const summaries = Object.fromEntries(
    resolveTemplate(t, log).tracks.map((r) => [r.track.id, Object.values(trackSummary(r)).join(": ")]),
  );
  assert.deepEqual(summaries, {
    "gr-caliper": "Curves: GR · CALI · not in this well: SGR, SP, BS",
    depth: "Depth: active depth reference",
    resistivity: "Curves: RDEP · not in this well: RMED, RSHA, RXO, RMIC, RES",
    "density-neutron": "Curves: not in this well: RHOB, NPHI, PEF",
    sonic: "Curves: not in this well: DTC, DTS",
    drilling: "Curves: not in this well: ROP, ROPA, MW",
    lithology: "Discrete: LITH",
    group: "Zones: GROUP",
    formation: "Zones: FORMATION · not in this well",
    curve: "Curves: none yet",
    "depth-tvdss": "Depth: TVDSS · not in this well log",
  });
});

test("fill boundaries are named by their curve, value or edge", () => {
  const log = wellLog([curve("GR", "gAPI")]);
  const track = resolveTemplate(defaultTemplate(), log).tracks[0] as ResolvedCurveTrack;
  assert.equal(boundaryLabel({ kind: "curve", id: "gamma-ray" }, track.entries), "GR");
  assert.equal(boundaryLabel({ kind: "curve", id: "caliper" }, track.entries), "CALI");
  assert.equal(boundaryLabel({ kind: "value", value: 75 }, track.entries), "75");
  assert.equal(boundaryLabel({ kind: "edge", edge: "left" }, track.entries), "left edge");
  assert.equal(
    track.track.fills?.map((fill) => fillLabel(fill, track.entries)).join(" | "),
    "GR to right edge | left edge to GR | CALI to BS",
  );
});
