import { test } from "node:test";
import assert from "node:assert/strict";
import { tvdssAt, type WellLog } from "../core/index.ts";
import {
  depthAxis,
  effectiveDepthRef,
  hasTvdss,
  intervalOnAxis,
  intervalToMd,
  onAxisWithin,
  toAxis,
  toMd,
} from "./axis.ts";
import { effectiveInterval, typedInterval } from "./navigation.ts";

const close = (actual: number, expected: number, message?: string) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, message ?? `${actual} ≉ ${expected}`);

// TVDSS is missing above 110 and below 150, and at the gap row at 130; the
// well is deviated, so TVDSS gains less than MD between samples.
const base: WellLog = {
  well: { id: "w", name: "W" },
  source: "test",
  depthUnit: "m",
  md: new Float64Array([100, 110, 120, 130, 140, 150, 160]),
  curves: [],
  zoneSets: [],
  header: [],
  warnings: [],
};
const withTvdss: WellLog = { ...base, tvdss: new Float64Array([NaN, 90, 95, NaN, 101, 104, NaN]) };
const noValidTvdss: WellLog = { ...base, tvdss: new Float64Array(7).fill(NaN) };

test("a well log has TVDSS when it holds at least two valid samples", () => {
  assert.equal(hasTvdss(withTvdss), true);
  assert.equal(hasTvdss(base), false);
  assert.equal(hasTvdss(noValidTvdss), false);
  assert.equal(hasTvdss({ ...base, tvdss: new Float64Array([NaN, 90, NaN, NaN, NaN, NaN, NaN]) }), false);
});

test("the effective depth reference is the preference where the well log has TVDSS, else MD", () => {
  assert.equal(effectiveDepthRef("tvdss", withTvdss), "tvdss");
  assert.equal(effectiveDepthRef("md", withTvdss), "md");
  assert.equal(effectiveDepthRef("tvdss", base), "md");
  assert.equal(effectiveDepthRef("tvdss", noValidTvdss), "md");
  assert.equal(effectiveDepthRef("md", base), "md");
});

test("a TVDSS preference survives a well log without TVDSS: it is shown again on the next one that has it", () => {
  const preference = "tvdss";
  assert.equal(effectiveDepthRef(preference, base), "md");
  assert.equal(effectiveDepthRef(preference, withTvdss), "tvdss");
});

test("the MD axis is the well log's MD over the whole well", () => {
  const axis = depthAxis(withTvdss, "md");
  assert.equal(axis.ref, "md");
  assert.equal(axis.depths, withTvdss.md);
  assert.deepEqual(axis.extent, { top: 100, base: 160 });
  assert.equal(toAxis(axis, 123.4), 123.4);
  assert.equal(toMd(axis, 123.4), 123.4);
});

test("asking for a TVDSS axis on a well log without TVDSS gives the MD axis", () => {
  assert.equal(depthAxis(base, "tvdss").ref, "md");
  assert.equal(depthAxis(noValidTvdss, "tvdss").ref, "md");
});

test("the TVDSS axis covers only the MD range that has TVDSS", () => {
  assert.deepEqual(depthAxis(withTvdss, "tvdss").extent, { top: 110, base: 150 });
});

test("TVDSS clamping: the effective interval is clamped to the MD range that has TVDSS", () => {
  const { extent } = depthAxis(withTvdss, "tvdss");
  assert.deepEqual(effectiveInterval(null, extent), { top: 110, base: 150 });
  assert.deepEqual(effectiveInterval({ top: 100, base: 130 }, extent), { top: 110, base: 130 });
  assert.deepEqual(effectiveInterval({ top: 140, base: 160 }, extent), { top: 140, base: 150 });
  // Wholly in the part without TVDSS: the whole of the part with it.
  assert.deepEqual(effectiveInterval({ top: 151, base: 160 }, extent), { top: 110, base: 150 });
});

test("each row's TVDSS depth is TVDSS interpolated across NaN rows, and infinite where it isn't known", () => {
  const { depths } = depthAxis(withTvdss, "tvdss");
  assert.deepEqual([...depths], [-Infinity, 90, 95, 98, 101, 104, Infinity]);
  for (let i = 1; i <= 5; i++) close(depths[i], tvdssAt(withTvdss, withTvdss.md[i]));
});

test("the TVDSS axis is memoised per well log", () => {
  assert.equal(depthAxis(withTvdss, "tvdss"), depthAxis(withTvdss, "tvdss"));
});

test("MD ↔ TVDSS on the axis: core's interpolation inside the range, infinite outside it towards MD, NaN back", () => {
  const axis = depthAxis(withTvdss, "tvdss");
  close(toAxis(axis, 125), 96.5);
  close(toMd(axis, 96.5), 125);
  assert.equal(toAxis(axis, 105), -Infinity);
  assert.equal(toAxis(axis, 155), Infinity);
  assert.ok(Number.isNaN(toMd(axis, 80)));
  assert.ok(Number.isNaN(toMd(axis, 110)));
});

test("an MD interval on the TVDSS axis and back", () => {
  const axis = depthAxis(withTvdss, "tvdss");
  const onAxis = intervalOnAxis(axis, { top: 115, base: 145 });
  close(onAxis.top, 92.5);
  close(onAxis.base, 102.5);
  const back = intervalToMd(axis, onAxis);
  close(back.top, 115);
  close(back.base, 145);
});

test("TVDSS typed into the interval input becomes an MD interval", () => {
  const axis = depthAxis(withTvdss, "tvdss");
  const typed = typedInterval("95", "101", intervalOnAxis(axis, axis.extent));
  assert.ok(typed);
  assert.deepEqual(intervalToMd(axis, typed), { top: 120, base: 140 });
  // Partly outside the TVDSS there is: clamped to it first.
  const clamped = typedInterval("50", "95", intervalOnAxis(axis, axis.extent));
  assert.ok(clamped);
  assert.deepEqual(intervalToMd(axis, clamped), { top: 110, base: 120 });
});

test("a zone partly without TVDSS is fitted to the part that has it", () => {
  const axis = depthAxis(withTvdss, "tvdss");
  assert.deepEqual(onAxisWithin(axis, { top: 100, base: 120 }), { top: 90, base: 95 });
  assert.deepEqual(onAxisWithin(axis, { top: 140, base: 160 }), { top: 101, base: 104 });
  // Wholly without it: the whole axis, as the effective interval falls back.
  assert.deepEqual(onAxisWithin(axis, { top: 151, base: 160 }), { top: 90, base: 104 });
});
