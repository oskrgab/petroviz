import { test } from "node:test";
import assert from "node:assert/strict";
import { fillPolygons, type BoundaryPlacement, type FillPolygon } from "./fill.ts";
import { log10Values } from "./log10.ts";
import type { Frame } from "./polyline.ts";
import { mappingOf, type ResolvedScale } from "./scale.ts";

const frame: Frame = { top: 0, base: 3, width: 100, height: 300 };
const md = new Float64Array([0, 1, 2, 3]);
const GR: ResolvedScale = { left: 0, right: 150, type: "linear" };

const curve = (values: number[], scale = GR): BoundaryPlacement => ({
  source: scale.type === "log" ? log10Values(Float32Array.from(values)) : Float32Array.from(values),
  mapping: mappingOf(scale),
});

/** Each polygon as its side and its [x, y] points, rounded to 1e-3. */
const shapes = (polygons: FillPolygon[]) =>
  polygons.map(({ aLeft, points }) => ({
    aLeft,
    points: Array.from({ length: points.length / 2 }, (_, j) => [points[2 * j], points[2 * j + 1]].map((v) => Math.round(v * 1000) / 1000)),
  }));

test("curve–curve: down along a, back up along b", () => {
  const polygons = fillPolygons(md, curve([30, 30, 45, 30]), curve([60, 75, 90, 60]), frame);
  assert.deepEqual(shapes(polygons), [
    {
      aLeft: true,
      points: [
        [20, 0], [20, 100], [30, 200], [20, 300],
        [40, 300], [60, 200], [50, 100], [40, 0],
      ],
    },
  ]);
});

test("curve–value: the value sits on the curve's scale, linear or log", () => {
  const cutoff = { fraction: 75 / 150 };
  assert.deepEqual(shapes(fillPolygons(md.subarray(0, 2), curve([30, 45]), cutoff, frame)), [
    { aLeft: true, points: [[20, 0], [30, 100], [50, 100], [50, 0]] },
  ]);

  const res: ResolvedScale = { left: 0.2, right: 2000, type: "log" };
  const at20 = { fraction: 0.5 }; // 20 ohm·m on 0.2–2000
  assert.deepEqual(shapes(fillPolygons(md.subarray(0, 2), curve([200, 200], res), at20, frame)), [
    { aLeft: false, points: [[75, 0], [75, 100], [50, 100], [50, 0]] },
  ]);
});

test("curve–edge: GR to the right edge, and the left edge to GR", () => {
  const gr = curve([30, 60]);
  assert.deepEqual(shapes(fillPolygons(md.subarray(0, 2), gr, { fraction: 1 }, frame)), [
    { aLeft: true, points: [[20, 0], [40, 100], [100, 100], [100, 0]] },
  ]);
  assert.deepEqual(shapes(fillPolygons(md.subarray(0, 2), { fraction: 0 }, gr, frame)), [
    { aLeft: true, points: [[0, 0], [0, 100], [40, 100], [20, 0]] },
  ]);
});

test("where the boundaries cross the fill is split there, and each side takes its colour", () => {
  // a runs 20 → 80 while b stays at 50: they cross halfway between rows 1 and 2.
  const polygons = fillPolygons(md, curve([30, 30, 120, 120]), curve([75, 75, 75, 75]), frame);
  assert.deepEqual(shapes(polygons), [
    { aLeft: true, points: [[20, 0], [20, 100], [50, 150], [50, 150], [50, 100], [50, 0]] },
    { aLeft: false, points: [[50, 150], [80, 200], [80, 300], [50, 300], [50, 200], [50, 150]] },
  ]);
});

test("touching without crossing doesn't split the fill", () => {
  const polygons = fillPolygons(md, curve([30, 75, 30, 30]), curve([75, 75, 75, 75]), frame);
  assert.deepEqual(polygons.map((p) => p.aLeft), [true]);
});

test("a missing value in either boundary breaks the fill", () => {
  const a = fillPolygons(md, curve([30, NaN, 30, 30]), { fraction: 1 }, frame);
  assert.deepEqual(shapes(a).map((p) => p.points.map(([, y]) => y)), [[200, 300, 300, 200]]);

  const b = fillPolygons(md, curve([30, 30, 30, 30]), curve([60, 60, NaN, 60]), frame);
  assert.deepEqual(shapes(b).map((p) => p.points.map(([, y]) => y)), [[0, 100, 100, 0]]);
});

test("boundaries sit at their clipped positions, off-scale values on the edge they ran past", () => {
  // GR 300 and −30 are off the 0–150 scale: the fill takes the edges, not
  // the line's run-out x, and never its wrapped x (300 → 150, −30 → 120).
  const polygons = fillPolygons(md.subarray(0, 2), curve([300, -30]), { fraction: 0.5 }, frame);
  assert.deepEqual(shapes(polygons), [
    { aLeft: false, points: [[100, 0], [50, 50], [50, 50], [50, 0]] },
    { aLeft: true, points: [[50, 50], [0, 100], [50, 100], [50, 50]] },
  ]);
});

test("caliper and bit size both past the right end coincide on the edge, so nothing is filled", () => {
  const caliper: ResolvedScale = { left: 6, right: 16, type: "linear" };
  const polygons = fillPolygons(md, curve([17.5, 18, 17.6, 17.5], caliper), curve([17.5, 17.5, 17.5, 17.5], caliper), frame);
  assert.deepEqual(polygons, []);
});

test("two fixed boundaries have no curve to follow and draw nothing", () => {
  assert.deepEqual(fillPolygons(md, { fraction: 0 }, { fraction: 1 }, frame), []);
});

test("decimated, a fill keeps each boundary's extremes in every pixel row", () => {
  // 40 samples in one 2-px-tall frame: 20 per pixel row, so M4 runs.
  const dense = new Float64Array(Array.from({ length: 40 }, (_, i) => i / 20));
  const a = Array.from({ length: 40 }, (_, i) => (i === 7 ? 150 : 30));
  const b = Array.from({ length: 40 }, (_, i) => (i === 13 ? 0 : 120));
  const polygons = fillPolygons(dense, curve(a), curve(b), { top: 0, base: 2, width: 100, height: 2 });
  const xs = polygons.flatMap((p) => Array.from(p.points.filter((_, j) => j % 2 === 0)));
  assert.ok(xs.includes(100), "a's spike to 150");
  assert.ok(xs.includes(0), "b's dip to 0");
  assert.ok(polygons.reduce((n, p) => n + p.points.length / 2, 0) < 40 * 2);
});
