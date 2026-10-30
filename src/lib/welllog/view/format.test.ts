import { test } from "node:test";
import assert from "node:assert/strict";
import { describeComputedEnds, formatCoverage, formatDepth, formatReading, formatScaleEnd, hasValue } from "./format.ts";

test("scale ends show as written, without float noise", () => {
  assert.deepEqual(
    [0, 150, 0.2, 2000, 1.95, 2.95, 0.45, -0.15, 140, 40].map(formatScaleEnd),
    ["0", "150", "0.2", "2000", "1.95", "2.95", "0.45", "-0.15", "140", "40"],
  );
  assert.equal(formatScaleEnd(Math.fround(0.2)), "0.2");
  assert.equal(formatScaleEnd(123.456), "123.5");
  assert.equal(formatScaleEnd(NaN), "—");
});

test("readings keep 4 significant digits, whole numbers from 1000 up, and — for no value", () => {
  assert.deepEqual(
    [85.123, Math.fround(2.3), 0.0123456, 140, -0.15, 10011.3, -7429, 1234.5, NaN].map(formatReading),
    ["85.12", "2.3", "0.01235", "140", "-0.15", "10011", "-7429", "1235", "—"],
  );
});

test("depths show one decimal", () => {
  assert.deepEqual([2180.04, 100, 99.96, NaN].map(formatDepth), ["2180.0", "100.0", "100.0", "—"]);
});

test("gap and — are readings without a value", () => {
  assert.deepEqual(["gap", "—", null, undefined, "0", "Shale"].map(hasValue), [false, false, false, false, true, true]);
});

test("coverage reads as its MD range and the whole % missing inside it", () => {
  assert.equal(formatCoverage({ top: 1234.56, base: 3456.71, missing: 0.123 }, "m"), "1234.6–3456.7 m · 12% missing");
  assert.equal(formatCoverage({ top: 100, base: 200, missing: 0 }, "ft"), "100.0–200.0 ft · 0% missing");
});

test("% missing never rounds a few missing values to none, or a few values to all", () => {
  const missing = (fraction: number) => formatCoverage({ top: 0, base: 1, missing: fraction }, "m").split(" · ")[1];
  assert.equal(missing(0.001), "<1% missing");
  assert.equal(missing(0.005), "1% missing");
  assert.equal(missing(0.996), ">99% missing");
  assert.equal(missing(1), "100% missing");
});

test("computed ends say how they are worked out; fixed ends need no note", () => {
  const percentile = (lo: number, hi: number) => ({ kind: "percentile", lo, hi, reversed: false }) as const;
  assert.equal(describeComputedEnds(percentile(1, 99), "linear"), "Computed from the whole curve: 1st to 99th percentile");
  assert.equal(describeComputedEnds(percentile(2, 98), "log"), "Computed from the whole curve: 2nd to 98th percentile");
  assert.equal(describeComputedEnds(percentile(3, 11), "log"), "Computed from the whole curve: 3rd to 11th percentile");
  const sp = { kind: "centredOnMedian", width: 100, reversed: false } as const;
  assert.equal(describeComputedEnds(sp, "linear"), "Computed from the whole curve: 100 wide, centred on its median");
  assert.equal(describeComputedEnds({ ...sp, width: 2 }, "log"), "Computed from the whole curve: 2 decades, centred on its median");
  assert.equal(describeComputedEnds({ kind: "fixed", left: 0, right: 150, unit: "gAPI" }, "linear"), null);
});
