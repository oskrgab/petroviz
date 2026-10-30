import { test } from "node:test";
import assert from "node:assert/strict";
import { isWellId, wellName, wellsIn } from "./wellId.ts";

test("a FORCE 2020 file stem is a well id", () => {
  for (const id of ["35-11-11", "34-10-16_R", "16-1-6_A", "15-9-13"]) assert.ok(isWellId(id), id);
});

test("anything that could change the URL it builds is not", () => {
  for (const id of ["", "35/11-11", "../schema", "a.parquet", "35-11-11?x=1", "a b", "35-11-11#", "é"]) {
    assert.ok(!isWellId(id), id);
  }
});

test("a well's name is its stem with the first - as / and each _ as a space", () => {
  assert.equal(wellName("34-10-16_R"), "34/10-16 R");
  assert.equal(wellName("35-11-11"), "35/11-11");
  assert.equal(wellName("16-11-1_ST3"), "16/11-1 ST3");
  assert.equal(wellName("25-2-13_T4"), "25/2-13 T4");
  assert.equal(wellName("7-1-2_S"), "7/1-2 S");
});

test("the well list keeps each parquet file whose stem is a well id, in order", () => {
  assert.deepEqual(wellsIn(["35-11-11.parquet", "README.md", "a b.parquet", 7, "34-10-16_R.parquet", "35-11-11"]), [
    { id: "35-11-11", name: "35/11-11" },
    { id: "34-10-16_R", name: "34/10-16 R" },
  ]);
});
