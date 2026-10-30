import { test } from "node:test";
import assert from "node:assert/strict";
import type { Curve, LoadWarning, WellLog } from "../core/index.ts";
import { curveCautions, curveCoverage, curveWarnings, gapsOf, hasValueIn, isGapRow } from "./quality.ts";

function curve(key: string, values: number[], kind: Curve["kind"] = "continuous"): Curve {
  return {
    key,
    mnemonic: key,
    unit: "",
    description: "",
    kind,
    family: kind === "discrete" ? "lithology" : "unknown",
    values: Float32Array.from(values),
  };
}

function wellLog(md: number[], curves: Curve[], warnings: LoadWarning[] = []): WellLog {
  return {
    well: { id: "w", name: "W" },
    source: "test",
    depthUnit: "m",
    md: Float64Array.from(md),
    curves,
    zoneSets: [],
    header: [],
    warnings,
  };
}

test("only cautions with a curve key mark a curve, never notes or well-level cautions", () => {
  const unreadable: LoadWarning = { code: "value-unreadable", curveKey: "GR", count: 3, message: "3 values in GR couldn't be read" };
  const discrete: LoadWarning = { code: "discrete-read-as-continuous", curveKey: "GR", message: "GR read as continuous" };
  const log = wellLog(
    [0],
    [curve("GR", [1])],
    [
      unreadable,
      { code: "sentinel-replaced", curveKey: "GR", count: 10, message: "10 missing values replaced" },
      { code: "sentinel-replaced", curveKey: "RHOB", count: 10, message: "10 missing values replaced" },
      { code: "depth-unit-assumed", message: "Depth unit assumed to be m" },
      discrete,
    ],
  );
  const cautions = curveCautions(log);
  assert.deepEqual([...cautions.keys()], ["GR"]);
  assert.deepEqual(cautions.get("GR"), [unreadable, discrete]);
});

test("a well log with no cautions marks no curve", () => {
  const log = wellLog([0], [curve("GR", [1])], [{ code: "gap-inserted", message: "1 gap" }]);
  assert.equal(curveCautions(log).size, 0);
});

test("a gap row is one where no curve, continuous or discrete, has a value", () => {
  const log = wellLog(
    [100, 101, 102, 103],
    [curve("GR", [1, NaN, NaN, 4]), curve("RHOB", [2, 2, NaN, NaN]), curve("LITH", [NaN, NaN, NaN, 65000], "discrete")],
  );
  assert.deepEqual([0, 1, 2, 3].map((row) => isGapRow(log, row)), [false, false, true, false]);
  assert.equal(isGapRow(log, -1), false);
  assert.equal(isGapRow(log, 4), false);
});

test("gaps run from the first all-NaN row's MD to the next row's, merging neighbours", () => {
  // Rows 2–3 are one gap; row 6 another. Row 4 has a value in one curve only: not a gap.
  const log = wellLog(
    [100, 100.5, 101, 101.5, 105, 105.5, 106, 120],
    [curve("GR", [1, 1, NaN, NaN, NaN, 1, NaN, 1]), curve("RHOB", [2, 2, NaN, NaN, 2, 2, NaN, 2])],
  );
  assert.deepEqual(gapsOf(log), [
    { top: 101, base: 105 },
    { top: 106, base: 120 },
  ]);
});

test("gaps are found from NaN rows, never from step sizes", () => {
  const log = wellLog([100, 100.1, 150, 150.1], [curve("GR", [1, 1, 1, 1])]);
  assert.deepEqual(gapsOf(log), []);
});

test("a gap at either end of the well log is kept; one on the last row has no thickness", () => {
  const log = wellLog([100, 101, 102, 103], [curve("GR", [NaN, 1, 1, NaN])]);
  assert.deepEqual(gapsOf(log), [
    { top: 100, base: 101 },
    { top: 103, base: 103 },
  ]);
});

test("gaps are found once per well log", () => {
  const log = wellLog([100, 101], [curve("GR", [NaN, 1])]);
  assert.equal(gapsOf(log), gapsOf(log));
});

test("no data in view: no value at any row inside the interval", () => {
  const md = Float64Array.from([100, 101, 102, 103, 104, 105]);
  const values = Float32Array.from([1, NaN, NaN, NaN, 5, NaN]);
  assert.equal(hasValueIn(md, values, { top: 100.5, base: 103.5 }), false);
  assert.equal(hasValueIn(md, values, { top: 100.5, base: 104 }), true, "a value on the base");
  assert.equal(hasValueIn(md, values, { top: 100, base: 101 }), true, "a value on the top");
  assert.equal(hasValueIn(md, values, { top: 200, base: 300 }), false, "below the well log");
  assert.equal(hasValueIn(md, Float32Array.from([NaN, NaN, NaN, NaN, NaN, NaN]), { top: 100, base: 105 }), false);
});

test("a line crossing the whole interval between two rows counts as data in view", () => {
  const md = Float64Array.from([100, 110]);
  assert.equal(hasValueIn(md, Float32Array.from([1, 2]), { top: 102, base: 104 }), true);
  assert.equal(hasValueIn(md, Float32Array.from([1, NaN]), { top: 102, base: 104 }), false);
});

test("a curve's coverage runs from its first value to its last", () => {
  const md = Float64Array.from([100, 101, 102, 103, 104, 105]);
  assert.deepEqual(curveCoverage(md, Float32Array.from([NaN, 1, 2, 3, 4, NaN])), { top: 101, base: 104, missing: 0 });
  assert.deepEqual(curveCoverage(md, Float32Array.from([1, 2, 3, 4, 5, 6])), { top: 100, base: 105, missing: 0 });
});

test("% missing is the share of the range, by depth, whose rows have no value", () => {
  // 100–110 m, with 102–106 m missing: 4 m of 10.
  const md = Float64Array.from([100, 102, 104, 106, 110]);
  assert.deepEqual(curveCoverage(md, Float32Array.from([1, NaN, NaN, 4, 5])), { top: 100, base: 110, missing: 0.4 });
  // A row without a value counts down to the next row, however far that is.
  const gapped = Float64Array.from([100, 101, 102, 150, 151]);
  const coverage = curveCoverage(gapped, Float32Array.from([1, 2, NaN, 4, 5]));
  assert.equal(coverage?.missing, 48 / 51);
});

test("a curve with one value covers a single depth, none of it missing", () => {
  const md = Float64Array.from([100, 101, 102]);
  assert.deepEqual(curveCoverage(md, Float32Array.from([NaN, 7, NaN])), { top: 101, base: 101, missing: 0 });
  assert.equal(curveCoverage(md, Float32Array.from([NaN, NaN, NaN])), null);
});

test("a curve's warnings are all of its load warnings, cautions first, notes included", () => {
  const note: LoadWarning = { code: "sentinel-replaced", curveKey: "GR", count: 10, message: "10 missing values replaced" };
  const caution: LoadWarning = { code: "value-unreadable", curveKey: "GR", count: 3, message: "3 values couldn't be read" };
  const log = wellLog(
    [0],
    [curve("GR", [1])],
    [note, { code: "sentinel-replaced", curveKey: "RHOB", message: "other curve" }, { code: "depth-sorted", message: "well" }, caution],
  );
  assert.deepEqual(curveWarnings(log, "GR"), [caution, note]);
  assert.deepEqual(curveWarnings(log, "NPHI"), []);
});
