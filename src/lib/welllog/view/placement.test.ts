import { test } from "node:test";
import assert from "node:assert/strict";
import { CARD_OFFSET, EDGE_MARGIN, POPUP_GAP, cardPlacement, popupPlacement } from "./placement.ts";

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

const popup = { width: 240, height: 200 };
const anchor = { left: 100, top: 50, right: 220, bottom: 80 };

test("a popup opens below its anchor, aligned to its left edge", () => {
  assert.deepEqual(popupPlacement(anchor, popup, viewport), { left: 100, top: 80 + POPUP_GAP });
});

test("a popup with no room below opens above its anchor", () => {
  const low = { left: 100, top: 700, right: 220, bottom: 730 };
  assert.deepEqual(popupPlacement(low, popup, viewport), { left: 100, top: 700 - POPUP_GAP - 200 });
});

test("a popup stays inside the window: right-aligned near its right edge, clamped when it can't fit", () => {
  const right = { left: 900, top: 50, right: 990, bottom: 80 };
  assert.deepEqual(popupPlacement(right, popup, viewport), { left: 1000 - EDGE_MARGIN - 240, top: 80 + POPUP_GAP });
  const tall = { width: 240, height: 900 };
  assert.deepEqual(popupPlacement(anchor, tall, viewport), { left: 100, top: EDGE_MARGIN });
});
