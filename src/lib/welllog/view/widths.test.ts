import { test } from "node:test";
import assert from "node:assert/strict";
import { MIN_STANDARD_TRACK_PX, trackColumns } from "./widths.ts";

test("each track takes its relative share, never below its share of the minimum", () => {
  assert.equal(MIN_STANDARD_TRACK_PX, 110);
  assert.equal(
    trackColumns([{ width: 1 }, { width: 0.5 }, { width: 0.75 }]),
    "minmax(110px, 1fr) minmax(55px, 0.5fr) minmax(82.5px, 0.75fr)",
  );
  assert.equal(trackColumns([]), "");
});
