import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "./build.ts";
import type { ForceColumns } from "./decode.ts";
import { checkWellLog, severityOf, type WellLog } from "../../welllog/core/index.ts";

const LABELS = { "30000": "Sandstone", "65000": "Shale", "90000": "Coal" };
const UNITS = { DEPTH_MD: "m", Z_LOC: "m", GR: "gAPI", RHOB: "g/cm³", RXO: "ohm·m", FORCE_2020_LITHOFACIES_LITHOLOGY: "code" };

/** A FORCE 2020 table of `md.length` rows; any column not given is left out. */
function columns(md: number[], extra: Record<string, unknown[]> = {}): ForceColumns {
  const n = md.length;
  return {
    WELL: Array(n).fill("35/11-11"),
    DEPTH_MD: md,
    Z_LOC: md.map((d) => -(d - 20)),
    GR: md.map((_, i) => 50 + i),
    ...extra,
  } as ForceColumns;
}

/** Build, and check the contract on every well log a test builds. */
function buildChecked(cols: ForceColumns): WellLog {
  const log = build(cols, { id: "35-11-11", units: UNITS, lithologyLabels: LABELS });
  assert.deepEqual(checkWellLog(log), []);
  return log;
}

function curve(log: WellLog, key: string) {
  const found = log.curves.find((c) => c.key === key);
  assert.ok(found, `no curve ${key}`);
  return found;
}

const codes = (log: WellLog) => log.warnings.map((w) => w.code);

test("identity: the id is the file stem and the name is the WELL column", () => {
  const log = buildChecked(columns([100, 100.152, 100.304]));
  assert.deepEqual(log.well, { id: "35-11-11", name: "35/11-11" });
  assert.equal(log.source, "FORCE 2020");
  assert.equal(log.depthUnit, "m");
});

test("curves keep their schema unit and get their family", () => {
  const log = buildChecked(columns([100, 100.152], { RHOB: [2.3, 2.4] }));
  assert.deepEqual(
    log.curves.map((c) => [c.key, c.mnemonic, c.unit, c.kind, c.family]),
    [
      ["GR", "GR", "gAPI", "continuous", "gamma-ray"],
      ["RHOB", "RHOB", "g/cm³", "continuous", "bulk-density"],
    ],
  );
});

test("depths, locations, zones and metadata are not curves", () => {
  const log = buildChecked(
    columns([100, 100.152], { X_LOC: [1, 2], Y_LOC: [3, 4], GROUP: ["A", "A"], FORMATION: ["B", "B"], dataset: ["train", "train"] }),
  );
  assert.deepEqual(
    log.curves.map((c) => c.key),
    ["GR"],
  );
});

test("unsorted runs come out sorted by MD, with a depth-sorted note", () => {
  const log = buildChecked(columns([100.304, 100.456, 100, 100.152], { GR: [3, 4, 1, 2] }));
  assert.deepEqual([...log.md], [100, 100.152, 100.304, 100.456]);
  assert.deepEqual([...curve(log, "GR").values], [1, 2, 3, 4]);
  assert.deepEqual([...log.tvdss!].map((t) => Math.round(t * 1000) / 1000), [80, 80.152, 80.304, 80.456]);
  const note = log.warnings.find((w) => w.code === "depth-sorted");
  assert.ok(note);
  assert.equal(severityOf(note.code), "note");
});

test("data already in depth order gets no depth-sorted note", () => {
  const log = buildChecked(columns([100, 100.152, 100.304]));
  assert.ok(!codes(log).includes("depth-sorted"));
});

test("repeated depths are dropped, keeping the first, with a caution", () => {
  const log = buildChecked(columns([100, 100.152, 100.152, 100.304], { GR: [1, 2, 99, 3] }));
  assert.deepEqual([...log.md], [100, 100.152, 100.304]);
  assert.deepEqual([...curve(log, "GR").values], [1, 2, 3]);
  const caution = log.warnings.find((w) => w.code === "duplicate-depth-dropped");
  assert.ok(caution);
  assert.equal(caution.count, 1);
  assert.equal(severityOf(caution.code), "caution");
});

test("a 269 m gap becomes one all-NaN row at the last sample's MD + 0.152 m", () => {
  const log = buildChecked(columns([1000, 1000.152, 1269.152, 1269.304], { RHOB: [2.1, 2.2, 2.3, 2.4] }));
  assert.equal(log.md.length, 5);
  assert.ok(Math.abs(log.md[2] - 1000.304) < 1e-9);
  for (const c of log.curves) assert.ok(Number.isNaN(c.values[2]), c.key);
  assert.ok(Number.isNaN(log.tvdss![2]));
  assert.deepEqual([...curve(log, "GR").values].filter((v) => !Number.isNaN(v)), [50, 51, 52, 53]);
  const note = log.warnings.find((w) => w.code === "gap-inserted");
  assert.ok(note);
  assert.equal(note.count, 1);
});

test("a step up to 1.5 × 0.152 m is not a gap", () => {
  const log = buildChecked(columns([100, 100.152, 100.37]));
  assert.equal(log.md.length, 3);
  assert.ok(!codes(log).includes("gap-inserted"));
});

test("NULL Z_LOC at both ends becomes NaN TVDSS, and TVDSS is −Z_LOC", () => {
  const log = buildChecked(columns([100, 100.152, 100.304, 100.456], { Z_LOC: [null, -80.1, -80.2, null] }));
  const tvdss = [...log.tvdss!];
  assert.ok(Number.isNaN(tvdss[0]));
  assert.deepEqual(tvdss.slice(1, 3), [80.1, 80.2]);
  assert.ok(Number.isNaN(tvdss[3]));
});

test("an all-NULL Z_LOC leaves the well log without TVDSS", () => {
  const log = buildChecked(columns([100, 100.152], { Z_LOC: [null, null] }));
  assert.equal(log.tvdss, undefined);
});

test("TVDSS that folds back is dropped, with a caution", () => {
  const log = buildChecked(columns([100, 100.152, 100.304], { Z_LOC: [-80, -81, -80.5] }));
  assert.equal(log.tvdss, undefined);
  assert.ok(codes(log).includes("tvdss-not-monotonic"));
});

test("float32-approximate sentinels become NaN, with a sentinel-replaced note per curve", () => {
  const log = buildChecked(
    columns([100, 100.152, 100.304, 100.456, 100.608], {
      RXO: [-999, -999.9000244, 1.5, -999.2501221, 2.5],
      Z_LOC: [-999, -999.152, -999.304, -999.456, -999.608],
    }),
  );
  const rxo = [...curve(log, "RXO").values];
  assert.ok(rxo.slice(0, 2).every(Number.isNaN));
  assert.equal(rxo[2], 1.5);
  assert.ok(Number.isNaN(rxo[3]));
  assert.equal(rxo[4], 2.5);
  const note = log.warnings.find((w) => w.code === "sentinel-replaced");
  assert.deepEqual(note && { curveKey: note.curveKey, count: note.count }, { curveKey: "RXO", count: 3 });
  assert.equal(log.warnings.filter((w) => w.code === "sentinel-replaced").length, 1);
});

test("real negative Z_LOC depths that look like sentinels are untouched", () => {
  const log = buildChecked(columns([100, 100.152], { Z_LOC: [-999, -999.25] }));
  assert.deepEqual([...log.tvdss!], [999, 999.25]);
});

test("values near a sentinel but not on it stay data", () => {
  const log = buildChecked(columns([100, 100.152], { RXO: [-995.864, -998.9] }));
  assert.equal(curve(log, "RXO").values[0], Math.fround(-995.864));
  assert.ok(!codes(log).includes("sentinel-replaced"));
});

test("an all-NULL column is absent, with no warning", () => {
  const log = buildChecked(columns([100, 100.152], { RHOB: [null, null] }));
  assert.ok(!log.curves.some((c) => c.key === "RHOB"));
  assert.deepEqual(log.warnings, []);
});

test("a column of nothing but sentinels is absent, with a curve-empty note naming it", () => {
  const log = buildChecked(columns([100, 100.152], { RXO: [-999, -999.9] }));
  assert.ok(!log.curves.some((c) => c.key === "RXO"));
  assert.deepEqual(codes(log), ["curve-empty"]);
  assert.equal(log.warnings[0].curveKey, undefined);
  assert.match(log.warnings[0].message, /RXO/);
  assert.equal(severityOf("curve-empty"), "note");
});

test("GROUP and FORMATION become two zone sets, base at the first row after the run", () => {
  const log = buildChecked(
    columns([100, 100.152, 100.304, 100.456], {
      GROUP: ["NORDLAND GP.", "NORDLAND GP.", "HORDALAND GP.", "HORDALAND GP."],
      FORMATION: ["Utsira Fm.", "Skade Fm.", "Skade Fm.", null],
    }),
  );
  assert.deepEqual(log.zoneSets, [
    {
      name: "GROUP",
      zones: [
        { name: "NORDLAND GP.", top: 100, base: 100.304 },
        // At the end of the data, the base is the last sample's MD.
        { name: "HORDALAND GP.", top: 100.304, base: 100.456 },
      ],
    },
    {
      name: "FORMATION",
      zones: [
        { name: "Utsira Fm.", top: 100, base: 100.152 },
        { name: "Skade Fm.", top: 100.152, base: 100.456 },
      ],
    },
  ]);
});

test("a zone name that resumes after a gap is one zone", () => {
  const log = buildChecked(
    columns([1000, 1000.152, 1269.152, 1269.304], { GROUP: ["SHETLAND GP.", "SHETLAND GP.", "SHETLAND GP.", "CROMER KNOLL GP."] }),
  );
  assert.deepEqual(log.zoneSets[0].zones, [
    { name: "SHETLAND GP.", top: 1000, base: 1269.304 },
    { name: "CROMER KNOLL GP.", top: 1269.304, base: 1269.304 },
  ]);
});

test("a zone that stops at a gap has its base at the gap row", () => {
  const log = buildChecked(
    columns([1000, 1000.152, 1269.152, 1269.304], { GROUP: ["SHETLAND GP.", "SHETLAND GP.", "CROMER KNOLL GP.", "CROMER KNOLL GP."] }),
  );
  const gapRow = log.md[2];
  assert.deepEqual(log.zoneSets[0].zones, [
    { name: "SHETLAND GP.", top: 1000, base: gapRow },
    { name: "CROMER KNOLL GP.", top: 1269.152, base: 1269.304 },
  ]);
});

test("zones are built after sorting", () => {
  const log = buildChecked(columns([100.304, 100, 100.152], { GROUP: ["B", "A", "A"] }));
  assert.deepEqual(log.zoneSets[0].zones, [
    { name: "A", top: 100, base: 100.304 },
    { name: "B", top: 100.304, base: 100.304 },
  ]);
});

test("an all-NULL zone column gives no zone set", () => {
  const log = buildChecked(columns([100, 100.152], { GROUP: [null, null], FORMATION: ["X", "X"] }));
  assert.deepEqual(
    log.zoneSets.map((s) => s.name),
    ["FORMATION"],
  );
});

test("bigint lithology codes become a discrete curve with string-keyed labels", () => {
  const log = buildChecked(
    columns([100, 100.152, 100.304], { FORCE_2020_LITHOFACIES_LITHOLOGY: [65000n, null, 90000n] }),
  );
  const lith = curve(log, "FORCE_2020_LITHOFACIES_LITHOLOGY");
  assert.equal(lith.kind, "discrete");
  assert.equal(lith.family, "lithology");
  assert.equal(lith.unit, "code");
  assert.equal(lith.values[0], 65000);
  assert.ok(Number.isNaN(lith.values[1]));
  assert.equal(lith.values[2], 90000);
  assert.equal(lith.codes?.[String(lith.values[2])], "Coal");
});

test("clean FORCE 2020 data produces no caution", () => {
  const log = buildChecked(
    columns([100.304, 100, 100.152, 300], { RXO: [-999, 1, 2, 3], GROUP: ["A", "A", "A", "A"] }),
  );
  assert.ok(log.warnings.length > 0);
  assert.ok(log.warnings.every((w) => severityOf(w.code) === "note"));
});
