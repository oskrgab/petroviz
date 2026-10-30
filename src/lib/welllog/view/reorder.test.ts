import { test } from "node:test";
import assert from "node:assert/strict";
import { dropEdge, dropIndex } from "./reorder.ts";

// Four tracks, 100 px each from x = 0.
const edges = [0, 100, 200, 300].map((left) => ({ left, right: left + 100 }));
const centres = edges.map(({ left, right }) => (left + right) / 2);

test("a dragged header lands after every other track whose centre it has passed", () => {
  assert.equal(dropIndex(centres, 1, 10), 0);
  assert.equal(dropIndex(centres, 1, 120), 1);
  assert.equal(dropIndex(centres, 1, 260), 2);
  assert.equal(dropIndex(centres, 1, 999), 3);
  assert.equal(dropIndex(centres, 3, 160), 2);
  assert.equal(dropIndex(centres, 0, 40), 0);
});

test("the drop marker sits on the border the track would land at", () => {
  // Track 1 dropped first, last, or back where it was.
  assert.equal(dropEdge(edges, 1, 0), 0);
  assert.equal(dropEdge(edges, 1, 3), 400);
  assert.equal(dropEdge(edges, 1, 1), 200);
  // Track 3 dropped between tracks 1 and 2.
  assert.equal(dropEdge(edges, 3, 2), 200);
});
