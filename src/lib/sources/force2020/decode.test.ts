import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { decode } from "./decode.ts";
import { build } from "./build.ts";
import { checkWellLog } from "../../welllog/core/index.ts";

// The first 300 rows of 34/6-1 S as petrodb stores them: out of depth order,
// ZSTD-compressed, every column kept. See fixtures/README.md.
const FIXTURE = new URL("./fixtures/34-6-1_S.head-300.parquet", import.meta.url);

async function fixtureBytes(): Promise<ArrayBuffer> {
  const file = await readFile(FIXTURE);
  return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
}

test("decode returns every column in file order, one value per row", async () => {
  const columns = await decode(await fixtureBytes());
  assert.deepEqual(Object.keys(columns), [
    "WELL", "DEPTH_MD", "X_LOC", "Y_LOC", "Z_LOC", "GROUP", "FORMATION",
    "CALI", "RSHA", "RMED", "RDEP", "RHOB", "GR", "SGR", "NPHI", "PEF", "DTC", "SP",
    "BS", "ROP", "DTS", "DCAL", "DRHO", "MUDWEIGHT", "RMIC", "ROPA", "RXO",
    "FORCE_2020_LITHOFACIES_LITHOLOGY", "dataset",
  ]);
  for (const [name, values] of Object.entries(columns)) assert.equal(values.length, 300, name);
});

test("decode reads numbers, strings and bigint codes as stored", async () => {
  const columns = await decode(await fixtureBytes());
  assert.equal(columns.WELL[0], "34/6-1 S");
  assert.equal(columns.DEPTH_MD[0], 3352.7144);
  assert.equal(columns.DEPTH_MD[299], 3453.0344);
  assert.equal(columns.GR[0], 108.39988708);
  assert.equal(columns.Z_LOC[0], -3174.722656);
  assert.equal(columns.GROUP[0], "SHETLAND GP.");
  assert.equal(columns.FORMATION[48], "Draupne Fm.");
  assert.equal(columns.FORCE_2020_LITHOFACIES_LITHOLOGY[0], 65000n);
});

test("decode keeps NULL as null, never 0", async () => {
  const columns = await decode(await fixtureBytes());
  assert.equal(columns.RHOB[0], null);
  const nulls = (name: string) => Array.from(columns[name]).filter((v) => v === null).length;
  assert.equal(nulls("RHOB"), 68);
  assert.equal(nulls("SGR"), 300);
  assert.equal(nulls("GR"), 0);
});

test("the decoded fixture builds a sound well log", async () => {
  const columns = await decode(await fixtureBytes());
  const log = build(columns, {
    id: "34-6-1_S",
    units: { DEPTH_MD: "m", GR: "gAPI", RHOB: "g/cm³", FORCE_2020_LITHOFACIES_LITHOLOGY: "code" },
    lithologyLabels: { "65000": "Shale" },
  });
  assert.deepEqual(checkWellLog(log), []);
  assert.equal(log.well.name, "34/6-1 S");
  assert.equal(log.md[0], 3352.5624);
  assert.ok(log.warnings.some((w) => w.code === "depth-sorted"));
  // All-NULL in these rows, so left out.
  for (const absent of ["SGR", "RSHA", "SP", "ROP", "DCAL", "DRHO", "MUDWEIGHT", "RMIC", "RXO"]) {
    assert.ok(!log.curves.some((c) => c.key === absent), absent);
  }
  assert.deepEqual(
    log.zoneSets.map((s) => s.name),
    ["GROUP", "FORMATION"],
  );
});
