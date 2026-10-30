import { test } from "node:test";
import assert from "node:assert/strict";
import { indexAtDepth, mdAt, tvdssAt, valueAt } from "./depth.ts";
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

test("TVDSS at an MD interpolates between the valid samples around it, across a NaN row", () => {
  const withTvdss: WellLog = { ...log, tvdss: new Float64Array([NaN, 80, NaN, 120, 120.2]) };
  assert.equal(tvdssAt(withTvdss, 100.2), 80);
  assert.ok(Math.abs(tvdssAt(withTvdss, 125.1) - 100) < 1e-9);
  assert.ok(Math.abs(tvdssAt(withTvdss, 150.1) - 120.1) < 1e-9);
});

test("TVDSS is never extrapolated: NaN above the first valid sample, below the last, or without TVDSS", () => {
  const withTvdss: WellLog = { ...log, tvdss: new Float64Array([NaN, 80, NaN, 120, 120.2]) };
  assert.ok(Number.isNaN(tvdssAt(withTvdss, 100.1)));
  assert.ok(Number.isNaN(tvdssAt(withTvdss, 150.3)));
  assert.ok(Number.isNaN(tvdssAt(log, 100.2)));
});

test("MD at a TVDSS interpolates between the valid samples around it, across a NaN row", () => {
  const withTvdss: WellLog = { ...log, tvdss: new Float64Array([NaN, 80, NaN, 120, 120.2]) };
  assert.equal(mdAt(withTvdss, 80), 100.2);
  assert.equal(mdAt(withTvdss, 120.2), 150.2);
  assert.ok(Math.abs(mdAt(withTvdss, 100) - 125.1) < 1e-9);
  assert.ok(Math.abs(mdAt(withTvdss, 120.1) - 150.1) < 1e-9);
});

test("MD → TVDSS → MD comes back where it started, inside the valid samples", () => {
  const withTvdss: WellLog = {
    ...log,
    md: new Float64Array([100, 110, 120, 130, 140, 150, 160]),
    tvdss: new Float64Array([NaN, 90, 95, NaN, 101, 104, NaN]),
  };
  for (let md = 110; md <= 150; md += 0.7) {
    assert.ok(Math.abs(mdAt(withTvdss, tvdssAt(withTvdss, md)) - md) < 1e-9, `${md}`);
  }
});

test("MD is never extrapolated: NaN above the first valid TVDSS, below the last, or without TVDSS", () => {
  const withTvdss: WellLog = { ...log, tvdss: new Float64Array([NaN, 80, NaN, 120, 120.2]) };
  assert.ok(Number.isNaN(mdAt(withTvdss, 79.9)));
  assert.ok(Number.isNaN(mdAt(withTvdss, 120.3)));
  assert.ok(Number.isNaN(mdAt(withTvdss, NaN)));
  assert.ok(Number.isNaN(mdAt(log, 100)));
  const none: WellLog = { ...log, tvdss: new Float64Array(5).fill(NaN) };
  assert.ok(Number.isNaN(mdAt(none, 100)));
});
