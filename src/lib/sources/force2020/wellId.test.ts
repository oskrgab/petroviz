import { test } from "node:test";
import assert from "node:assert/strict";
import { isWellId } from "./wellId.ts";

test("a FORCE 2020 file stem is a well id", () => {
  for (const id of ["35-11-11", "34-10-16_R", "16-1-6_A", "15-9-13"]) assert.ok(isWellId(id), id);
});

test("anything that could change the URL it builds is not", () => {
  for (const id of ["", "35/11-11", "../schema", "a.parquet", "35-11-11?x=1", "a b", "35-11-11#", "é"]) {
    assert.ok(!isWellId(id), id);
  }
});
