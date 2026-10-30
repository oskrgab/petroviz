import { test } from "node:test";
import assert from "node:assert/strict";
import { CARD_OFFSET, EDGE_MARGIN, cardPlacement } from "./placement.ts";

const viewport = { width: 1000, height: 800 };
const card = { width: 200, height: 300 };

test("the card sits right of and below the pointer", () => {
  assert.deepEqual(cardPlacement({ x: 100, y: 100 }, card, viewport), {
    left: 100 + CARD_OFFSET,
    top: 100 + CARD_OFFSET,
  });
});

test("near the right edge the card flips to the left of the pointer", () => {
  const { left } = cardPlacement({ x: 900, y: 100 }, card, viewport);
  assert.equal(left, 900 - CARD_OFFSET - card.width);
});

test("near the bottom edge the card flips above the pointer", () => {
  const { top } = cardPlacement({ x: 100, y: 700 }, card, viewport);
  assert.equal(top, 700 - CARD_OFFSET - card.height);
});

test("a card that fits on neither side stays inside the window", () => {
  const { left, top } = cardPlacement({ x: 150, y: 250 }, { width: 900, height: 700 }, viewport);
  assert.equal(left, EDGE_MARGIN);
  assert.equal(top, EDGE_MARGIN);
});
