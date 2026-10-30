import { test } from "node:test";
import assert from "node:assert/strict";
import { fractionOf, mappingOf, type ResolvedScale } from "./scale.ts";
import { log10Values } from "./log10.ts";
import { curvePolyline, END_TOLERANCE, firstRowAtOrBelow, visibleRows, wrappedPolyline, type Frame } from "./polyline.ts";
import { intervalSpans } from "./blocks.ts";
import { depthGridlines, depthStep, depthsEvery, scaleGridlines } from "./grid.ts";

const near = (actual: number, expected: number, message?: string) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, message ?? `${actual} ≉ ${expected}`);

/** Pairs from a flat polyline, with a NaN pair as null. */
const pairs = (line: Float32Array) =>
  Array.from({ length: line.length / 2 }, (_, i) =>
    Number.isNaN(line[2 * i]) ? null : [line[2 * i], line[2 * i + 1]],
  );

test("value → position on a linear scale", () => {
  const gr: ResolvedScale = { left: 0, right: 150, type: "linear" };
  near(fractionOf(0, gr), 0);
  near(fractionOf(75, gr), 0.5);
  near(fractionOf(150, gr), 1);
});

test("value → position on a reversed scale runs right to left", () => {
  const nphi: ResolvedScale = { left: 0.45, right: -0.15, type: "linear" };
  near(fractionOf(0.45, nphi), 0);
  near(fractionOf(0.15, nphi), 0.5);
  near(fractionOf(-0.15, nphi), 1);
  const dtc: ResolvedScale = { left: 140, right: 40, type: "linear" };
  near(fractionOf(115, dtc), 0.25);
});

test("value → position on a log scale is even per decade", () => {
  const res: ResolvedScale = { left: 0.2, right: 2000, type: "log" };
  near(fractionOf(0.2, res), 0);
  near(fractionOf(2, res), 0.25);
  near(fractionOf(20, res), 0.5);
  near(fractionOf(2000, res), 1);
  assert.ok(Number.isNaN(fractionOf(0, res)));
  assert.ok(Number.isNaN(fractionOf(-1, res)));
});

test("off-scale values land outside the track, never pinned to its edge", () => {
  const gr: ResolvedScale = { left: 0, right: 150, type: "linear" };
  near(fractionOf(300, gr), 2);
  near(fractionOf(-30, gr), -0.2);

  const md = new Float64Array([0, 1, 2]);
  const values = new Float32Array([75, 300, -30]);
  const frame: Frame = { top: 0, base: 2, width: 100, height: 200 };
  const xs = pairs(curvePolyline(md, values, mappingOf(gr), frame)).map((p) => p?.[0]);
  assert.deepEqual(xs, [50, 200, -20]);
});

test("the log10 buffer is computed once per values array", () => {
  const values = new Float32Array([1, 10, 100, 0, -5, NaN]);
  const logs = log10Values(values);
  assert.equal(log10Values(values), logs);
  assert.deepEqual(Array.from(logs.subarray(0, 3)), [0, 1, 2]);
  assert.ok(Array.from(logs.subarray(3)).every(Number.isNaN));
  assert.notEqual(log10Values(new Float32Array(values)), logs);
});

test("a log-scale line is drawn from the log10 buffer", () => {
  const res: ResolvedScale = { left: 0.2, right: 2000, type: "log" };
  const md = new Float64Array([0, 1]);
  const line = curvePolyline(md, log10Values(new Float32Array([2, 20])), mappingOf(res), {
    top: 0,
    base: 1,
    width: 100,
    height: 100,
  });
  const xs = pairs(line).map((p) => p?.[0] ?? NaN);
  near(xs[0], 25);
  near(xs[1], 50);
});

test("y follows MD down the frame", () => {
  const md = new Float64Array([100, 110, 120]);
  const line = curvePolyline(md, new Float32Array([1, 2, 3]), { a: 0.1, b: 0 }, {
    top: 100,
    base: 120,
    width: 10,
    height: 40,
  });
  assert.deepEqual(pairs(line), [
    [1, 0],
    [2, 20],
    [3, 40],
  ]);
});

test("an all-NaN row breaks the line instead of joining across it", () => {
  // Row 2 is a gap row: every curve is NaN there.
  const md = new Float64Array([0, 1, 2, 3, 4]);
  const values = new Float32Array([1, 2, NaN, 4, 5]);
  const line = curvePolyline(md, values, { a: 0.1, b: 0 }, { top: 0, base: 4, width: 10, height: 400 });
  assert.deepEqual(pairs(line), [[1, 0], [2, 100], null, [4, 300], [5, 400]]);
});

test("leading, trailing and repeated missing values add no empty segments", () => {
  const md = new Float64Array([0, 1, 2, 3, 4, 5]);
  const values = new Float32Array([NaN, 1, NaN, NaN, 2, NaN]);
  const line = curvePolyline(md, values, { a: 0.1, b: 0 }, { top: 0, base: 5, width: 10, height: 500 });
  assert.deepEqual(
    pairs(line).map((p) => (p ? p[0] : null)),
    [1, null, 2, null],
  );
});

test("M4 keeps the first, minimum, maximum and last sample of each pixel row", () => {
  // 40 rows over a 2 px tall frame: 20 samples per pixel row, above the 4× threshold.
  const n = 40;
  const md = Float64Array.from({ length: n }, (_, i) => i);
  const values = new Float32Array(n).fill(5);
  // Pixel row 0 holds rows 0–19, pixel row 1 holds rows 20–39.
  values[0] = 4; // first
  values[7] = 9; // max
  values[12] = 1; // min
  values[19] = 6; // last
  values[25] = 0; // min (the first sample, row 20, is also its max)
  values[39] = 3; // last
  const frame: Frame = { top: 0, base: 40, width: 10, height: 2 };
  const line = pairs(curvePolyline(md, values, { a: 0.1, b: 0 }, frame));
  const ys = line.map((p) => Math.round(p![1] / (frame.height / 40)));
  assert.deepEqual(ys, [0, 7, 12, 19, 20, 25, 39]);
  assert.deepEqual(
    line.map((p) => Math.round(p![0])),
    [4, 9, 1, 6, 5, 0, 3],
  );
});

test("M4 still breaks the line at an all-NaN row", () => {
  const n = 40;
  const md = Float64Array.from({ length: n }, (_, i) => i);
  const values = new Float32Array(n).fill(5);
  values[10] = NaN;
  const line = pairs(curvePolyline(md, values, { a: 0.1, b: 0 }, { top: 0, base: 40, width: 10, height: 2 }));
  const breakAt = line.indexOf(null);
  assert.ok(breakAt > 0 && breakAt < line.length - 1);
  assert.ok(line.slice(0, breakAt).every((p) => p![1] < 10 * (2 / 40)));
  assert.ok(line.slice(breakAt + 1).every((p) => p![1] > 10 * (2 / 40)));
});

test("no decimation at or under 4 samples per pixel row", () => {
  const n = 8;
  const md = Float64Array.from({ length: n }, (_, i) => i);
  const line = curvePolyline(md, new Float32Array(n).fill(1), { a: 0.1, b: 0 }, {
    top: 0,
    base: 7,
    width: 10,
    height: 2,
  });
  assert.equal(line.length / 2, n);
});

/** x per point of a wrapped line, null where it breaks. */
const wrappedXs = (values: number[], scale: ResolvedScale, width = 150, inset = 0) => {
  const md = Float64Array.from(values, (_, i) => i);
  const source = scale.type === "log" ? log10Values(new Float32Array(values)) : new Float32Array(values);
  const frame: Frame = { top: 0, base: values.length - 1, width, height: 1000 };
  return pairs(wrappedPolyline(md, source, mappingOf(scale), frame, inset)).map((p) => (p ? p[0] : null));
};

/** Float32 positions against expected ones, to a thousandth of a px. */
const nearXs = (xs: (number | null)[], expected: (number | null)[]) => {
  assert.equal(xs.length, expected.length, `${xs} vs ${expected}`);
  xs.forEach((x, i) =>
    expected[i] === null ? assert.equal(x, null) : assert.ok(Math.abs(x! - expected[i]!) < 1e-3, `${xs} vs ${expected}`),
  );
};

test("wrap on a linear scale: a stretch past the right end comes back from the left edge", () => {
  const gr: ResolvedScale = { left: 0, right: 150, type: "linear" };
  // 75 in, 200 and 210 off to the right, 100 back in. Width 150: x = value.
  nearXs(wrappedXs([75, 200, 210, 100], gr), [75 - 150, 50, 60, 100 - 150]);
  // Off to the left of a reversed scale (DTC 140 → 40): 150 µs/ft is past the left end.
  const dtc: ResolvedScale = { left: 140, right: 40, type: "linear" };
  // 150 is a tenth of a width past the left end, so it wraps to 0.9 (where 50 sits).
  nearXs(wrappedXs([90, 150], dtc), [75 + 150, 135]);
});

test("wrap on a log scale shifts by one span", () => {
  const res: ResolvedScale = { left: 0.2, right: 2000, type: "log" };
  // 20 000 is a quarter-span past 2000, so it wraps onto where 2 sits.
  nearXs(wrappedXs([20, 20000], res, 100), [50 - 100, 25]);
  // 0.02 is a quarter-span short of 0.2, so it wraps onto where 200 sits.
  nearXs(wrappedXs([20, 0.02], res, 100), [50 + 100, 75]);
});

test("a value still off the scale after one shift runs out of the track, to be cut", () => {
  const gr: ResolvedScale = { left: 0, right: 150, type: "linear" };
  const xs = wrappedXs([100, 400, 100], gr);
  assert.ok(xs[1]! > 150, `${xs[1]} is past the right edge`);
});

test("an on-scale curve has no wrapped line, and the wrapped line breaks where the curve does", () => {
  const gr: ResolvedScale = { left: 0, right: 150, type: "linear" };
  assert.deepEqual(wrappedXs([0, 75, 150], gr), []);
  // Two stretches past the right end either side of a missing value.
  nearXs(wrappedXs([160, NaN, 170], gr), [10, null, 20]);
  // A jump from past one end to past the other leaves by one edge and comes in by the other.
  nearXs(wrappedXs([160, -10], gr), [10, -160, null, 160 + 150, 140]);
});

test("values on a scale end, within float32 tolerance, stay on it", () => {
  const bs: ResolvedScale = { left: 6, right: 16, type: "linear" };
  const f32 = (v: number) => Math.fround(v);
  assert.ok(f32(26.000002) > 26 && (f32(26.000002) - 16) / 10 - 1 < END_TOLERANCE);
  // A 16-in bit stored as 16.000002 is on the right end, not wrapped round to the left one.
  assert.deepEqual(wrappedXs([f32(16.000002), f32(16.000002)], bs, 100), []);
  const md = new Float64Array([0, 1]);
  const frame: Frame = { top: 0, base: 1, width: 100, height: 100 };
  const xs = pairs(curvePolyline(md, new Float32Array([16.000002, 6]), mappingOf(bs), frame)).map((p) => p![0]);
  assert.deepEqual(xs, [100, 0]);
  // A 26-in bit stored as 26.000002 wraps onto the right end and is drawn there.
  nearXs(wrappedXs([f32(26.000002), f32(26.000002)], bs, 100), [100, 100]);
});

test("an on-scale point keeps the inset from each edge, so a line on an end draws whole", () => {
  const bs: ResolvedScale = { left: 6, right: 16, type: "linear" };
  const md = new Float64Array([0, 1, 2]);
  const frame: Frame = { top: 0, base: 2, width: 100, height: 100 };
  const xs = pairs(curvePolyline(md, new Float32Array([6, 11, 16]), mappingOf(bs), frame, 1)).map((p) => p![0]);
  assert.deepEqual(xs, [1, 50, 99]);
  // Off the scale it still runs out.
  const off = pairs(curvePolyline(md, new Float32Array([4, 11, 18]), mappingOf(bs), frame, 1)).map((p) => p![0]);
  assert.deepEqual(off, [-20, 50, 120]);
});

test("visible rows reach one row past each edge of the frame", () => {
  const md = new Float64Array([0, 10, 20, 30, 40, 50]);
  assert.deepEqual(visibleRows(md, { top: 15, base: 35, width: 1, height: 1 }), [1, 5]);
  assert.deepEqual(visibleRows(md, { top: 0, base: 50, width: 1, height: 1 }), [0, 6]);
  // A row on the edge reaches it already.
  assert.deepEqual(visibleRows(md, { top: 20, base: 30, width: 1, height: 1 }), [1, 4]);
});

test("a linear scale has 10 divisions", () => {
  const lines = scaleGridlines({ left: 0, right: 150, type: "linear" });
  assert.equal(lines.length, 9);
  lines.forEach((line, i) => near(line.fraction, (i + 1) / 10));
  assert.ok(lines.every((line) => !line.major));
  assert.equal(scaleGridlines({ left: 140, right: 40, type: "linear" }).length, 9);
});

test("a log scale has lines at 1–9 × 10ⁿ, the decades major", () => {
  const lines = scaleGridlines({ left: 0.2, right: 2000, type: "log" });
  // 0.3–0.9, then 1–9 for 1, 10 and 100, then 1000: 7 + 27 + 1 = 35.
  assert.equal(lines.length, 35);
  const major = lines.filter((line) => line.major).map((line) => line.fraction);
  assert.equal(major.length, 4);
  const res: ResolvedScale = { left: 0.2, right: 2000, type: "log" };
  [1, 10, 100, 1000].forEach((decade, i) => near(major[i], fractionOf(decade, res)));
  near(lines[0].fraction, fractionOf(0.3, res));
  assert.ok(lines.every((line) => line.fraction > 0 && line.fraction < 1));
});

test("a reversed log scale mirrors its gridlines", () => {
  const forward = scaleGridlines({ left: 1, right: 1000, type: "log" }).map((l) => l.fraction);
  const reversed = scaleGridlines({ left: 1000, right: 1, type: "log" }).map((l) => 1 - l.fraction);
  assert.equal(forward.length, reversed.length);
  reversed.sort((p, q) => p - q).forEach((f, i) => near(f, forward[i]));
});

test("depth steps are round and spaced far enough apart", () => {
  assert.equal(depthStep(0.355, 10), 50);
  assert.equal(depthStep(0.355, 40), 200);
  assert.equal(depthStep(30, 10), 0.5);
  assert.deepEqual(depthsEvery(0.1, 0.05, 0.35), [0.1, 0.2, 0.3]);
  assert.deepEqual(depthsEvery(200, 1245.17, 1900), [1400, 1600, 1800]);
});

test("major depth gridlines are every fifth minor step or more", () => {
  const { minor, major } = depthGridlines(1245, 3215, 0.355);
  assert.equal(minor[0], 1250);
  assert.equal(minor[1] - minor[0], 50);
  assert.deepEqual(major, [1500, 2000, 2500, 3000]);
});

test("a line on a TVDSS axis is placed by each row's TVDSS and breaks at rows without it", () => {
  // MD rows 10 apart; TVDSS gains 5, then 2; the first and last rows have none.
  const depths = new Float64Array([-Infinity, 100, 105, 107, Infinity]);
  const values = new Float32Array([5, 5, 5, 5, 5]);
  const line = pairs(curvePolyline(depths, values, { a: 0.1, b: 0 }, { top: 100, base: 110, width: 10, height: 100 }));
  assert.deepEqual(line, [
    [5, 0],
    [5, 50],
    [5, 70],
    null,
  ]);
});

test("depth intervals → spans in device px, leaving out those outside the frame", () => {
  const frame: Frame = { top: 100, base: 110, width: 40, height: 100 };
  assert.deepEqual(
    intervalSpans(
      [
        { top: 90, base: 95 },
        { top: 98, base: 101 },
        { top: 104, base: 104 },
        { top: 109, base: 130 },
        { top: 111, base: 120 },
      ],
      frame,
    ),
    [
      { y0: -20, y1: 10 },
      { y0: 40, y1: 40 },
      { y0: 90, y1: 300 },
    ],
  );
});

test("the first row at or below a depth", () => {
  const md = Float64Array.from([100, 101, 102]);
  assert.deepEqual([99, 100, 100.5, 102, 103].map((d) => firstRowAtOrBelow(md, d)), [0, 0, 1, 2, 3]);
});
