import { test } from "node:test";
import assert from "node:assert/strict";
import { checkWellLog } from "./check.ts";
import type { Curve, WellLog } from "./wellLog.ts";

function curve(key: string, values: number[], extra: Partial<Curve> = {}): Curve {
  return {
    key,
    mnemonic: key,
    unit: "",
    description: "",
    kind: "continuous",
    family: "unknown",
    values: new Float32Array(values),
    ...extra,
  };
}

function wellLog(extra: Partial<WellLog> = {}): WellLog {
  return {
    well: { id: "w", name: "W" },
    source: "test",
    depthUnit: "m",
    md: new Float64Array([100, 101, 102]),
    tvdss: new Float64Array([NaN, 90, 91]),
    curves: [curve("GR", [1, NaN, 3])],
    zoneSets: [{ name: "GROUP", zones: [{ name: "A", top: 100, base: 101 }, { name: "B", top: 101, base: 102 }] }],
    header: [],
    warnings: [{ code: "sentinel-replaced", curveKey: "GR", count: 1, message: "" }],
    ...extra,
  };
}

/** The rules broken, in order. */
function rules(log: WellLog): string[] {
  return checkWellLog(log).map((v) => v.rule);
}

test("a well-formed well log has no violations", () => {
  assert.deepEqual(checkWellLog(wellLog()), []);
});

test("MD that repeats or goes back up is a violation", () => {
  assert.deepEqual(rules(wellLog({ md: new Float64Array([100, 100, 102]) })), ["md-not-increasing"]);
  assert.deepEqual(rules(wellLog({ md: new Float64Array([100, 102, 101]), tvdss: undefined })), [
    "md-not-increasing",
  ]);
});

test("NaN in MD is a violation", () => {
  assert.deepEqual(rules(wellLog({ md: new Float64Array([100, NaN, 102]) })), ["md-not-increasing"]);
});

test("a well log with no rows is a violation", () => {
  assert.deepEqual(
    rules(wellLog({ md: new Float64Array([]), tvdss: undefined, curves: [], zoneSets: [], warnings: [] })),
    ["no-rows"],
  );
});

test("TVDSS that isn't strictly increasing over its non-NaN rows is a violation", () => {
  assert.deepEqual(rules(wellLog({ tvdss: new Float64Array([90, NaN, 90]) })), ["tvdss-not-increasing"]);
  assert.deepEqual(rules(wellLog({ tvdss: new Float64Array([92, 91, NaN]) })), ["tvdss-not-increasing"]);
});

test("TVDSS or a curve with the wrong length is a violation", () => {
  assert.deepEqual(rules(wellLog({ tvdss: new Float64Array([90, 91]) })), ["length-mismatch"]);
  assert.deepEqual(rules(wellLog({ curves: [curve("GR", [1, 2, 3, 4])] })), ["length-mismatch"]);
});

test("a curve with no value at all is a violation", () => {
  assert.deepEqual(rules(wellLog({ curves: [curve("GR", [1, 2, 3]), curve("RHOB", [NaN, NaN, NaN])] })), [
    "curve-empty",
  ]);
});

test("two curves with one key is a violation", () => {
  assert.deepEqual(rules(wellLog({ curves: [curve("GR", [1, 2, 3]), curve("GR", [1, 2, 3])] })), [
    "duplicate-key",
  ]);
});

test("a discrete curve holding a non-integer is a violation", () => {
  const lith = curve("LITH", [30000, NaN, 65000.5], { kind: "discrete", family: "lithology" });
  assert.deepEqual(rules(wellLog({ curves: [curve("GR", [1, 2, 3]), lith] })), ["discrete-not-integer"]);
});

test("zones out of order, overlapping or upside down are a violation", () => {
  const set = (zones: { name: string; top: number; base: number }[]) => wellLog({ zoneSets: [{ name: "G", zones }] });
  assert.deepEqual(rules(set([{ name: "A", top: 101, base: 100 }])), ["zone-order"]);
  assert.deepEqual(
    rules(set([{ name: "A", top: 100, base: 101.5 }, { name: "B", top: 101, base: 102 }])),
    ["zone-order"],
  );
  // A zone of one row at the end of the data has its top at its base.
  assert.deepEqual(rules(set([{ name: "A", top: 102, base: 102 }])), []);
});

test("a warning must use a known code and name a curve in the well log", () => {
  assert.deepEqual(
    rules(wellLog({ warnings: [{ code: "made-up" as "gap-inserted", message: "" }] })),
    ["unknown-warning-code"],
  );
  assert.deepEqual(
    rules(wellLog({ warnings: [{ code: "sentinel-replaced", curveKey: "SP", message: "" }] })),
    ["warning-unknown-curve"],
  );
});

test("a depth unit other than m or ft is a violation", () => {
  assert.deepEqual(rules(wellLog({ depthUnit: "km" as "m" })), ["depth-unit"]);
});

test("every violation is reported, each with a message", () => {
  const violations = checkWellLog(
    wellLog({
      md: new Float64Array([100, 100, 102]),
      curves: [curve("GR", [NaN, NaN, NaN])],
    }),
  );
  assert.deepEqual(
    violations.map((v) => v.rule),
    ["md-not-increasing", "curve-empty"],
  );
  for (const v of violations) assert.ok(v.message.length > 0);
});
