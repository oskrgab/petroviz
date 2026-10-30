import { test } from "node:test";
import assert from "node:assert/strict";
import { indexAtDepth, valueAt } from "./depth.ts";
import type { Curve, WellLog } from "./wellLog.ts";

const gr: Curve = {
  key: "GR",
  mnemonic: "GR",
  unit: "gAPI",
  description: "",
  kind: "continuous",
  family: "gamma-ray",
  values: new Float32Array([10, 20, NaN, 40, 50]),
};

// 100.4 is a gap row: every curve is NaN there, up to the next sample at 150.
const log: WellLog = {
  well: { id: "w", name: "W" },
  source: "test",
  depthUnit: "m",
  md: new Float64Array([100, 100.2, 100.4, 150, 150.2]),
  curves: [gr],
  zoneSets: [],
  header: [],
  warnings: [],
};

test("a depth on a sample gives that sample", () => {
  assert.equal(indexAtDepth(log, 100), 0);
  assert.equal(indexAtDepth(log, 150), 3);
  assert.equal(indexAtDepth(log, 150.2), 4);
});

test("a depth between samples gives the sample above it", () => {
  assert.equal(indexAtDepth(log, 100.1), 0);
  assert.equal(indexAtDepth(log, 100.39), 1);
  assert.equal(indexAtDepth(log, 150.19), 3);
});

test("anywhere in a gap gives the gap row, however far below it", () => {
  assert.equal(indexAtDepth(log, 100.4), 2);
  assert.equal(indexAtDepth(log, 149.99), 2);
});

test("a depth outside the well log gives -1", () => {
  assert.equal(indexAtDepth(log, 99.99), -1);
  assert.equal(indexAtDepth(log, 150.21), -1);
  assert.equal(indexAtDepth(log, NaN), -1);
});

test("valueAt reads the curve at the row indexAtDepth finds", () => {
  assert.equal(valueAt(log, gr, 100.1), 10);
  assert.equal(valueAt(log, gr, 150.1), 40);
});

test("valueAt is NaN in a gap and outside the well log", () => {
  assert.ok(Number.isNaN(valueAt(log, gr, 120)));
  assert.ok(Number.isNaN(valueAt(log, gr, 99)));
  assert.ok(Number.isNaN(valueAt(log, gr, 151)));
});
