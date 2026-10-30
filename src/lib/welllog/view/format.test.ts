import { test } from "node:test";
import assert from "node:assert/strict";
import { formatScaleEnd } from "./format.ts";

test("scale ends show as written, without float noise", () => {
  assert.deepEqual(
    [0, 150, 0.2, 2000, 1.95, 2.95, 0.45, -0.15, 140, 40].map(formatScaleEnd),
    ["0", "150", "0.2", "2000", "1.95", "2.95", "0.45", "-0.15", "140", "40"],
  );
  assert.equal(formatScaleEnd(Math.fround(0.2)), "0.2");
  assert.equal(formatScaleEnd(123.456), "123.5");
  assert.equal(formatScaleEnd(NaN), "—");
});
