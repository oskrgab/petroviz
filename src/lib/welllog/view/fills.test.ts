import { test } from "node:test";
import assert from "node:assert/strict";
import { boundaryChoice, boundaryOf, colourWithNone, colourWithRgb, isNoColour, midway } from "./fills.ts";
import type { FillBoundary } from "./template/types.ts";

test("a boundary and its choice in the fill editor round-trip", () => {
  const boundaries: FillBoundary[] = [
    { kind: "curve", id: "gamma-ray" },
    { kind: "curve", id: "a:b" },
    { kind: "edge", edge: "left" },
    { kind: "edge", edge: "right" },
  ];
  for (const boundary of boundaries) assert.deepEqual(boundaryOf(boundaryChoice(boundary), null), boundary);
  assert.equal(boundaryChoice({ kind: "value", value: 75 }), "value");
});

test("a value chosen starts half-way across the other side's curve scale, as drawn", () => {
  assert.deepEqual(boundaryOf("value", { left: 0, right: 150, type: "linear" }), { kind: "value", value: 75 });
  assert.deepEqual(boundaryOf("value", { left: 0.45, right: -0.15, type: "linear" }), { kind: "value", value: 0.15 });
  // On a log scale, half-way is the geometric mean, to two significant digits.
  assert.deepEqual(boundaryOf("value", { left: 0.2, right: 2000, type: "log" }), { kind: "value", value: 20 });
  assert.equal(midway({ left: 1, right: 3, type: "linear" }), 2);
  // Without a curve on the other side to place it on, it starts at 0.
  assert.deepEqual(boundaryOf("value", null), { kind: "value", value: 0 });
});

test("a colour picked for a fill keeps its alpha, and a fill side with none takes the default alpha", () => {
  assert.equal(colourWithRgb("#FFFF0066", "#00ff00"), "#00FF0066");
  assert.equal(colourWithRgb("#FFFF0080", "#123abc"), "#123ABC80");
  assert.equal(colourWithRgb("#00000000", "#00ff00"), "#00FF0066");
});

test("a fill side can be set to none and back, keeping its colour", () => {
  assert.equal(isNoColour("#00000000"), true);
  assert.equal(isNoColour("#BEBEBE66"), false);
  assert.equal(colourWithNone("#BEBEBE66", true), "#BEBEBE00");
  assert.equal(colourWithNone("#BEBEBE00", false), "#BEBEBE66");
  // The GR fills' unused side has no colour of its own: it comes back grey, not black.
  assert.equal(colourWithNone("#00000000", false), "#BEBEBE66");
});
