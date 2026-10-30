import { test } from "node:test";
import assert from "node:assert/strict";
import { curveFamilyOf, type Curve, type WellLog } from "../core/index.ts";
import { notShownLabel, pickerCurves } from "./picker.ts";
import { resolveTemplate } from "./resolve.ts";
import { defaultTemplate } from "./template/defaults.ts";

function curve(key: string, unit = "", kind: Curve["kind"] = "continuous"): Curve {
  return {
    key,
    mnemonic: key,
    unit,
    description: "",
    kind,
    family: kind === "discrete" ? "lithology" : curveFamilyOf(key, unit),
    values: new Float32Array([1, 2]),
  };
}

function wellLog(curves: Curve[]): WellLog {
  return {
    well: { id: "w", name: "W" },
    source: "test",
    depthUnit: "m",
    md: new Float64Array([100, 101]),
    curves,
    zoneSets: [],
    header: [],
    warnings: [],
  };
}

const keys = (curves: readonly Curve[]) => curves.map((c) => c.key);

test("the picker lists the continuous curves the template doesn't display, in well log order, then the rest", () => {
  const log = wellLog([
    curve("DRHO", "g/cm3"),
    curve("GR", "gAPI"),
    curve("XYZ"),
    curve("LITH", "", "discrete"),
    curve("RHOB", "g/cm3"),
    curve("ABC"),
  ]);
  const resolved = resolveTemplate(defaultTemplate(), log);
  const { notShown, shown } = pickerCurves(resolved, log.curves);
  assert.deepEqual(keys(notShown), ["DRHO", "XYZ", "ABC"]);
  assert.deepEqual(keys(shown), ["GR", "RHOB"]);
  // Its count is the template's unmatched curves, less the discrete ones a curve track can't take.
  assert.equal(notShown.length, resolved.unmatchedCurves.filter((c) => c.kind === "continuous").length);
});

test("a discrete curve the template doesn't display is in neither list", () => {
  const log = wellLog([curve("GR", "gAPI"), curve("LITH", "", "discrete")]);
  const template = defaultTemplate();
  const t = { ...template, tracks: template.tracks.filter((track) => track.kind !== "discrete") };
  const resolved = resolveTemplate(t, log);
  assert.deepEqual(keys(resolved.unmatchedCurves), ["LITH"]);
  assert.deepEqual(pickerCurves(resolved, log.curves), { notShown: [], shown: [log.curves[0]] });
});

test("the count reads as a sentence", () => {
  assert.deepEqual([0, 1, 6].map(notShownLabel), ["Every curve is shown", "1 curve not shown", "6 curves not shown"]);
});
