import { test } from "node:test";
import assert from "node:assert/strict";
import { boundedWidth, MAX_TRACK_WIDTH, MIN_STANDARD_TRACK_PX, MIN_TRACK_WIDTH, resizedWidth, trackColumns } from "./widths.ts";

test("each track takes its relative share, never below its share of the minimum", () => {
  assert.equal(MIN_STANDARD_TRACK_PX, 110);
  assert.equal(
    trackColumns([{ width: 1 }, { width: 0.5 }, { width: 0.75 }]),
    "minmax(110px, 1fr) minmax(55px, 0.5fr) minmax(82.5px, 0.75fr)",
  );
  assert.equal(trackColumns([]), "");
});

/** Each track's right edge, in px from the first track's left, as the grid lays them out. */
function edges(widths: number[], available: number): number[] {
  const total = widths.reduce((sum, w) => sum + w, 0);
  const perUnit = Math.max(MIN_STANDARD_TRACK_PX, available / total);
  let right = 0;
  return widths.map((w) => (right += w * perUnit));
}

/** Drags track `i`'s border to `edge`, and returns where it is laid out afterwards. */
function drag(widths: number[], i: number, available: number, edge: number) {
  const sum = (ws: number[]) => ws.reduce((s, w) => s + w, 0);
  const width = resizedWidth({
    width: widths[i],
    before: sum(widths.slice(0, i)),
    after: sum(widths.slice(i + 1)),
    available,
    edge,
  });
  const next = widths.map((w, j) => (j === i ? width : w));
  return { width, edge: edges(next, available)[i] };
}

test("a dragged border stays under the pointer, the tracks still sharing the row", () => {
  const widths = [1, 0.5, 1, 1];
  // At 1400 px, one unit is 400 px: track 2's border is at 1000.
  for (const edge of [1100, 950, 900]) {
    const after = drag(widths, 2, 1400, edge);
    assert.ok(Math.abs(after.edge - edge) < 2, `${edge} → ${after.edge}`);
  }
});

test("dragged past the row's end, the tracks overflow at their minimums and the border still follows", () => {
  const after = drag([1, 0.5, 1, 1], 2, 1000, 1200);
  assert.ok(Math.abs(after.edge - 1200) < 2, String(after.edge));
  // Already overflowing: one unit is 110 px.
  assert.equal(drag([1, 0.5, 1, 1], 2, 300, 385).width, 2);
});

test("the last track, or a lone one, reaches the row's end whatever its width, so it only grows past it", () => {
  assert.equal(drag([1, 1], 1, 800, 700).width, 1);
  assert.equal(drag([1], 0, 800, 600).width, 1);
  assert.equal(drag([1], 0, 800, 1100).width, 10);
  assert.ok(Math.abs(drag([1, 1], 1, 800, 1000).edge - 1000) < 2);
});

test("a dragged width keeps to its bounds, to two decimals", () => {
  assert.equal(drag([1, 0.5, 1, 1], 2, 1400, 500).width, MIN_TRACK_WIDTH);
  assert.equal(drag([1, 0.5, 1, 1], 2, 300, 1e6).width, MAX_TRACK_WIDTH);
  const { width } = drag([1, 0.5, 1, 1], 2, 1400, 1033);
  assert.equal(width, Math.round(width * 100) / 100);
});

test("a width typed or dragged is kept within bounds, to two decimals", () => {
  assert.equal(boundedWidth(0.05), MIN_TRACK_WIDTH);
  assert.equal(boundedWidth(99), MAX_TRACK_WIDTH);
  assert.equal(boundedWidth(1.234), 1.23);
});
