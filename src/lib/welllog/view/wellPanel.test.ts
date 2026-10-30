import { test } from "node:test";
import assert from "node:assert/strict";
import { cautionCount, identityRows, warningSections } from "./wellPanel.ts";
import type { LoadWarning, WellLog } from "../core/index.ts";

function wellLog(extra: Partial<WellLog> = {}): WellLog {
  return {
    well: { id: "35-11-11", name: "35/11-11" },
    source: "FORCE 2020",
    depthUnit: "m",
    md: new Float64Array([1245.1716, 1245.3236, 3214.7876]),
    tvdss: new Float64Array([NaN, 1200.25, 3150.04]),
    curves: [],
    zoneSets: [],
    header: [],
    warnings: [],
    ...extra,
  };
}

test("identity lists name, id, source, depth unit, MD range and TVDSS range", () => {
  assert.deepEqual(identityRows(wellLog()), [
    ["Name", "35/11-11"],
    ["Id", "35-11-11"],
    ["Source", "FORCE 2020"],
    ["Depth unit", "m"],
    ["MD range", "1245.2 – 3214.8 m"],
    ["TVDSS range", "1200.3 – 3150.0 m"],
  ]);
});

test("identity leaves out the TVDSS range for a well log without TVDSS", () => {
  const rows = identityRows(wellLog({ tvdss: undefined, depthUnit: "ft" }));
  assert.deepEqual(rows.at(-1), ["MD range", "1245.2 – 3214.8 ft"]);
  assert.ok(!rows.some(([label]) => label === "TVDSS range"));
});

const w = (code: LoadWarning["code"], extra: Partial<LoadWarning> = {}): LoadWarning => ({
  code,
  message: `${code} message`,
  ...extra,
});

test("cautions come first, one line each, in the order the adapter gave them", () => {
  const { cautions } = warningSections([
    w("sentinel-replaced", { curveKey: "GR", count: 3 }),
    w("value-unreadable", { curveKey: "RHOB", count: 2 }),
    w("depth-unit-assumed"),
  ]);
  assert.deepEqual(
    cautions.map((c) => c.code),
    ["value-unreadable", "depth-unit-assumed"],
  );
});

test("notes are grouped one line per code, summarised, with their items to expand", () => {
  const { notes } = warningSections([
    w("sentinel-replaced", { curveKey: "GR", count: 3 }),
    w("gap-inserted", { count: 3, message: "3 gaps were marked" }),
    w("sentinel-replaced", { curveKey: "RXO", count: 40 }),
  ]);
  assert.deepEqual(
    notes.map((n) => [n.code, n.summary, n.items.map((i) => i.curveKey ?? null)]),
    [
      ["sentinel-replaced", "Missing values replaced in 2 curves", ["GR", "RXO"]],
      ["gap-inserted", "3 gaps were marked", [null]],
    ],
  );
});

test("a per-curve note on one curve reads in the singular", () => {
  const { notes } = warningSections([w("sentinel-replaced", { curveKey: "GR", count: 3 })]);
  assert.equal(notes[0].summary, "Missing values replaced in 1 curve");
});

test("the badge counts cautions only", () => {
  assert.equal(cautionCount(wellLog({ warnings: [w("gap-inserted"), w("depth-sorted")] })), 0);
  assert.equal(
    cautionCount(wellLog({ warnings: [w("gap-inserted"), w("row-dropped"), w("version-assumed")] })),
    2,
  );
});
