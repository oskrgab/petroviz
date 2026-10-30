import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { lasToWellLog } from "./pipeline.ts";
import { checkWellLog } from "../core/index.ts";

const FIXTURES = new URL("./fixtures/", import.meta.url);
const bytes = (path: string) => new Uint8Array(readFileSync(new URL(path, FIXTURES)));

test("a FORCE 2020 LAS export runs end to end into a sound well log", () => {
  const log = lasToWellLog(bytes("force2020/32_2-1.trimmed.las"), "32_2-1.las");
  assert.deepEqual(checkWellLog(log), []);

  assert.deepEqual(log.well, { id: "32/2-1", name: "32/2-1" });
  assert.equal(log.source, "32_2-1.las");
  assert.equal(log.depthUnit, "m");
  assert.equal(log.md.length, 300);
  assert.equal(log.md[0], 873.0676);
  assert.equal(log.md[299], 918.5156);
  assert.equal(log.tvdss, undefined, "z_loc stays an ordinary curve");
  assert.deepEqual(log.zoneSets, []);

  const header = Object.fromEntries(log.header.map((h) => [h.mnemonic, h]));
  assert.deepEqual(header.DATE, { mnemonic: "DATE", unit: "", value: "2020-08-09 20:01:42", description: "Log Export Date {yyyy-MM-dd HH:mm:ss}" });
  assert.equal(header.NULL.value, "-999.250000");

  const byKey = Object.fromEntries(log.curves.map((c) => [c.key, c]));
  assert.equal(byKey.GR.family, "gamma-ray");
  assert.equal(byKey.GR.unit, "gAPI");
  assert.equal(byKey.RDEP.family, "resistivity-deep");
  assert.equal(byKey.FORCE_2020_LITHOFACIES_LITHOLOGY.kind, "discrete");
  assert.deepEqual(
    [...new Set(byKey.FORCE_2020_LITHOFACIES_LITHOLOGY.values)].sort(),
    [30000, 65000, 65030],
  );
  assert.equal(byKey.ROPA.values[0], Math.fround(Number(readFirstRow()[5])));

  // DTS is declared but holds only NULLs in these rows.
  assert.ok(!("DTS" in byKey));
  assert.deepEqual(log.warnings.map((w) => w.code), ["curve-empty"]);
  assert.match(log.warnings[0].message, /^DTS /);
});

/** The fixture's first data row, as its tokens. */
function readFirstRow(): string[] {
  const text = new TextDecoder().decode(bytes("force2020/32_2-1.trimmed.las"));
  const data = text.slice(text.indexOf("~Ascii"));
  return data.split("\n")[1].trim().split(/\s+/);
}

test("every lasio fixture either builds a sound well log or throws a readable message", () => {
  const thrown: Record<string, string> = {};
  const walk = (dir: URL, prefix = ""): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? walk(new URL(`${entry.name}/`, dir), `${prefix}${entry.name}/`)
        : entry.name.endsWith(".las")
          ? [`${prefix}${entry.name}`]
          : [],
    );

  for (const name of walk(new URL("lasio/", FIXTURES))) {
    try {
      const log = lasToWellLog(bytes(`lasio/${name}`), name);
      assert.deepEqual(checkWellLog(log), [], name);
    } catch (error) {
      if (error instanceof assert.AssertionError) throw error;
      thrown[name] = (error as Error).message;
    }
  }
  assert.deepEqual(Object.keys(thrown).sort(), ["3.0/sample_3.0.las", "data_characters.las", "missing_a_section.las"]);
  assert.match(thrown["3.0/sample_3.0.las"], /LAS 3\.0/);
  assert.match(thrown["data_characters.las"], /no depth/);
  assert.match(thrown["missing_a_section.las"], /no rows/);
});
