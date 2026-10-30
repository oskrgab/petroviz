import { test } from "node:test";
import assert from "node:assert/strict";
import type { Curve, CurveFamily } from "../../core/index.ts";
import { SET3, hashedIndex } from "../colour/categorical.ts";
import { discreteBlocks } from "../geometry/blocks.ts";
import { HATCHES } from "../hatches.ts";
import { discreteFamilyDefaults } from "../template/defaults.ts";
import { FGDC_PATTERNS } from "../template/types.ts";
import { codeStyles } from "./discrete/index.ts";
import { zoneAt } from "./zone/index.ts";

function discrete(values: number[], family: CurveFamily = "lithology"): Curve {
  return {
    key: "LITH",
    mnemonic: "LITH",
    unit: "",
    description: "",
    kind: "discrete",
    family,
    values: Float32Array.from(values),
  };
}

test("lithology codes take the KGS colours and FGDC patterns; no value takes nothing", () => {
  const styles = codeStyles(discrete([65000, 65000, NaN, 30000, 90000]));
  assert.deepEqual(
    [...styles].sort(([a], [b]) => a - b),
    [
      [30000, { colour: "#FFFF00", pattern: 607 }],
      [65000, { colour: "#BEBEBE", pattern: 620 }],
      [90000, { colour: "#000000", pattern: 658 }],
    ],
  );
});

test("limestone and chalk share a colour and are told apart by their hatch", () => {
  const codes = discreteFamilyDefaults.lithology!.codes;
  const limestone = codes["70000"];
  const chalk = codes["70032"];
  assert.equal(limestone.colour, chalk.colour);
  assert.notEqual(limestone.pattern, chalk.pattern);
  assert.notDeepEqual(HATCHES[limestone.pattern!], HATCHES[chalk.pattern!]);
});

test("every FORCE 2020 lithology code has a distinct colour and pattern pair, and every pattern a hatch", () => {
  const codes = Object.values(discreteFamilyDefaults.lithology!.codes);
  assert.equal(codes.length, 12);
  assert.equal(new Set(codes.map((c) => `${c.colour} ${c.pattern}`)).size, 12);
  for (const pattern of FGDC_PATTERNS) assert.ok(HATCHES[pattern], `${pattern}`);
  const marks = (p: number) => JSON.stringify(HATCHES[p as keyof typeof HATCHES]);
  assert.equal(new Set(codes.map((c) => marks(c.pattern!))).size, 12);
});

test("a template code map replaces the family default for its codes only", () => {
  const styles = codeStyles(discrete([65000, 30000]), { "65000": { colour: "#336699" } });
  assert.deepEqual(styles.get(65000), { colour: "#336699" });
  assert.deepEqual(styles.get(30000), { colour: "#FFFF00", pattern: 607 });
});

test("codes with no known style take distinct Set3 colours and no pattern", () => {
  // A LAS facies curve coded 1–8, and a lithology curve with a code outside KGS.
  const facies = codeStyles(discrete([3, 1, 2, 8, 5, 4, 7, 6, 1], "unknown"));
  assert.equal(facies.size, 8);
  assert.equal(new Set([...facies.values()].map((s) => s.colour)).size, 8);
  for (const style of facies.values()) assert.ok(SET3.includes(style.colour) && style.pattern === undefined);
  assert.deepEqual(codeStyles(discrete([65000, 12345])).get(12345), { colour: SET3[hashedIndex("12345")] });
});

const frame = { top: 100, base: 110, width: 40, height: 100 };

test("discrete blocks: one per run, ending where the next code starts, none for no value", () => {
  const md = Float64Array.from([100, 101, 102, 103, 104, 105, 106]);
  const values = Float32Array.from([1, 1, 2, NaN, NaN, 2, 2]);
  assert.deepEqual(discreteBlocks(md, values, frame), [
    { code: 1, y0: 0, y1: 20 },
    { code: 2, y0: 20, y1: 30 },
    { code: 2, y0: 50, y1: 60 },
  ]);
});

test("discrete blocks reach past the frame's edges, so a run crossing an edge fills to it", () => {
  // Frame 100–110: code 2 crosses the top, code 3 the base; 1 and 4 lie outside.
  const md = Float64Array.from([90, 95, 105, 115, 120]);
  const values = Float32Array.from([1, 2, 3, 3, 4]);
  assert.deepEqual(discreteBlocks(md, values, frame), [
    { code: 2, y0: -50, y1: 50 },
    { code: 3, y0: 50, y1: 200 },
  ]);
});

test("discrete blocks on a TVDSS axis: rows with no place on it draw nothing, and a run meeting one ends at its last row", () => {
  // TVDSS known from 100 to 104 only; frame 100–110.
  const depths = Float64Array.from([-Infinity, 100, 101, 104, Infinity, Infinity]);
  const values = Float32Array.from([1, 1, 2, 2, 2, 3]);
  assert.deepEqual(discreteBlocks(depths, values, frame), [
    { code: 1, y0: 0, y1: 10 },
    { code: 2, y0: 10, y1: 40 },
  ]);
});

test("the zone at a depth: top inclusive, base exclusive", () => {
  const zones = [
    { name: "A", top: 100, base: 150 },
    { name: "B", top: 150, base: 180 },
    { name: "C", top: 200, base: 210 },
  ];
  assert.equal(zoneAt(zones, 99.9), null);
  assert.equal(zoneAt(zones, 100), 0);
  assert.equal(zoneAt(zones, 150), 1);
  assert.equal(zoneAt(zones, 190), null);
  assert.equal(zoneAt(zones, 209.9), 2);
  assert.equal(zoneAt(zones, 210), null);
});
