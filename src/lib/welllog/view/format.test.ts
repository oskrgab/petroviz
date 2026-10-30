import { test } from "node:test";
import assert from "node:assert/strict";
import { formatDepth, formatReading, formatScaleEnd, hasValue } from "./format.ts";

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
