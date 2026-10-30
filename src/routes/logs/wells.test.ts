import { test } from "node:test";
import assert from "node:assert/strict";
import { wellName } from "../../lib/sources/force2020/wellId.ts";
import { filterWells, groupByQuadrant, sortWells, type WellEntry } from "./wells.ts";

const well = (id: string): WellEntry => ({ id, name: wellName(id) });
const ids = (wells: readonly WellEntry[]) => wells.map((w) => w.id);

test("wells sort by quadrant, block and well number, as numbers", () => {
  const sorted = sortWells(["35-11-11", "34-10-16_R", "7-1-1", "34-2-4", "34-10-2", "35-11-1", "16-10-1", "16-2-6"].map(well));
  assert.deepEqual(ids(sorted), ["7-1-1", "16-2-6", "16-10-1", "34-2-4", "34-10-2", "34-10-16_R", "35-11-1", "35-11-11"]);
});

test("a suffix sorts after the bare well, and suffixes by name", () => {
  const sorted = sortWells(["34-5-1_S", "34-5-1_A", "34-5-10", "34-5-1"].map(well));
  assert.deepEqual(ids(sorted), ["34-5-1", "34-5-1_A", "34-5-1_S", "34-5-10"]);
});

test("a stem that isn't quadrant-block-well sorts last, by name", () => {
  const sorted = sortWells(["odd", "35-11-11", "another"].map(well));
  assert.deepEqual(ids(sorted), ["35-11-11", "another", "odd"]);
});

test("sorted wells group under their quadrant, in order", () => {
  const groups = groupByQuadrant(sortWells(["34-10-16_R", "7-1-1", "34-2-4", "7-1-2_S", "odd"].map(well)));
  assert.deepEqual(
    groups.map((g) => [g.quadrant, ids(g.wells)]),
    [
      ["7", ["7-1-1", "7-1-2_S"]],
      ["34", ["34-2-4", "34-10-16_R"]],
      [null, ["odd"]],
    ],
  );
});

test("search ignores punctuation, spaces and case", () => {
  const wells = ["34-10-16_R", "34-10-19", "35-11-11", "16-11-1_ST3"].map(well);
  assert.deepEqual(ids(filterWells(wells, "34 10 16")), ["34-10-16_R"]);
  assert.deepEqual(ids(filterWells(wells, "3410-16")), ["34-10-16_R"]);
  assert.deepEqual(ids(filterWells(wells, "34/10-16 r")), ["34-10-16_R"]);
  assert.deepEqual(ids(filterWells(wells, "st3")), ["16-11-1_ST3"]);
  assert.deepEqual(ids(filterWells(wells, "3410")), ["34-10-16_R", "34-10-19"]);
});

test("an empty or punctuation-only query keeps every well", () => {
  const wells = ["34-10-16_R", "35-11-11"].map(well);
  assert.deepEqual(ids(filterWells(wells, "")), ids(wells));
  assert.deepEqual(ids(filterWells(wells, " / - ")), ids(wells));
});

test("a query matching nothing keeps nothing", () => {
  assert.deepEqual(filterWells(["35-11-11"].map(well), "99"), []);
});
