import { test } from "node:test";
import assert from "node:assert/strict";
import { buildWellLog } from "./build.ts";
import type { LasDocument, LasHeaderItem, LasSection } from "./parse.ts";
import { TOKEN_MISSING, TOKEN_UNREADABLE, isMissingMarker } from "./scan.ts";
import { checkWellLog, severityOf, type LoadWarning, type LoadWarningCode, type WellLog } from "../core/index.ts";

type Cell = number | string;

interface Spec {
  version?: string | null;
  /** `"W NULL . -999.25 : NULL VALUE"`-like tuples: section, mnemonic, unit, value, description. */
  items?: [LasSection, string, string, string, string?][];
  /** `"DEPT.M"`: the mnemonic, a dot, the unit. */
  curves?: string[];
  /** One array per row. A string cell is a token that wasn't a number. */
  rows: Cell[][];
  droppedLines?: number;
}

/** An in-memory LAS document, as parseLas would give it. */
function doc({ version = "2.0", items = [], curves = ["DEPT.M", "GR.GAPI"], rows, droppedLines = 0 }: Spec): LasDocument {
  const width = rows[0]?.length ?? curves.length;
  const columns = Array.from({ length: width }, () => new Float64Array(rows.length));
  const nonNumeric: (Uint8Array | undefined)[] = Array(width).fill(undefined);
  rows.forEach((row, r) =>
    row.forEach((cell, j) => {
      if (typeof cell === "number") {
        columns[j][r] = cell;
        return;
      }
      columns[j][r] = NaN;
      (nonNumeric[j] ??= new Uint8Array(rows.length))[r] = isMissingMarker(cell) ? TOKEN_MISSING : TOKEN_UNREADABLE;
    }),
  );
  const header = (section: LasSection, mnemonic: string, unit: string, value: string, description = ""): LasHeaderItem => ({
    section, mnemonic, unit, value, description,
  });
  return {
    version,
    wrap: false,
    items: [...(version === null ? [] : [header("V", "VERS", "", version)]), ...items.map((i) => header(...i))],
    curves: curves.map((c) => {
      const dot = c.indexOf(".");
      return header("C", c.slice(0, dot), c.slice(dot + 1), "");
    }),
    data: { rows: rows.length, columns, nonNumeric, droppedLines },
  };
}

/** Build, and check the contract on every well log a test builds. */
function build(spec: Spec, fileName = "well_a.las"): WellLog {
  const log = buildWellLog(doc(spec), fileName);
  assert.deepEqual(checkWellLog(log), []);
  return log;
}

function curve(log: WellLog, key: string) {
  const found = log.curves.find((c) => c.key === key);
  assert.ok(found, `no curve ${key}`);
  return found;
}

const values = (log: WellLog, key: string) => [...curve(log, key).values];
const codes = (log: WellLog) => log.warnings.map((w) => w.code);
const warning = (log: WellLog, code: LoadWarningCode, curveKey?: string) =>
  log.warnings.find((w) => w.code === code && w.curveKey === curveKey);

const ROWS: Cell[][] = [
  [100, 50],
  [100.5, 60],
  [101, 70],
];

// --- identity and header -------------------------------------------------------

test("identity: WELL names the well, UWI then API identify it, the file name is the source", () => {
  const log = build({ rows: ROWS, items: [["W", "WELL", "", "WELL-A"], ["W", "API", "", "42-123"], ["W", "UWI", "", "100/01"]] });
  assert.deepEqual(log.well, { id: "100/01", name: "WELL-A" });
  assert.equal(log.source, "well_a.las");

  assert.deepEqual(build({ rows: ROWS, items: [["W", "WELL", "", "WELL-A"], ["W", "API", "", "42-123"]] }).well, {
    id: "42-123",
    name: "WELL-A",
  });
});

test("a blank WELL takes the file name without its extension, which is also the id", () => {
  const log = build({ rows: ROWS, items: [["W", "WELL", "", ""], ["W", "UWI", "", "  "]] }, "logs/well_b.v2.las");
  assert.deepEqual(log.well, { id: "well_b.v2", name: "well_b.v2" });
  assert.equal(log.source, "logs/well_b.v2.las");
});

test("the header holds every ~V, ~W and ~P item in file order, but not the curves", () => {
  const log = build({
    rows: ROWS,
    items: [["W", "STRT", "M", "100"], ["P", "BHT", "DEGC", "35.5", "BOTTOM HOLE TEMPERATURE"], ["W", "WELL", "", "A"]],
  });
  assert.deepEqual(
    log.header.map((h) => h.mnemonic),
    ["VERS", "STRT", "BHT", "WELL"],
  );
  assert.deepEqual(log.header[2], { mnemonic: "BHT", unit: "DEGC", value: "35.5", description: "BOTTOM HOLE TEMPERATURE" });
});

test("LAS 1.2 swaps value and description in ~W, except STRT, STOP, STEP and NULL", () => {
  const items: Spec["items"] = [
    ["W", "STRT", "M", "100", "START"],
    ["W", "NULL", "", "-999.25", ""],
    ["W", "WELL", "", "WELL", "ANY ET AL OIL WELL #12"],
    ["W", "UWI", "", "UNIQUE WELL ID", "100091604920W300"],
    ["P", "BHT", "DEGC", "35.5", "BOTTOM HOLE TEMPERATURE"],
  ];
  const old = build({ version: "1.2", rows: ROWS, items });
  assert.deepEqual(old.well, { id: "100091604920W300", name: "ANY ET AL OIL WELL #12" });
  const byMnemonic = Object.fromEntries(old.header.map((h) => [h.mnemonic, [h.value, h.description]]));
  assert.deepEqual(byMnemonic.STRT, ["100", "START"]);
  assert.deepEqual(byMnemonic.NULL, ["-999.25", ""]);
  assert.deepEqual(byMnemonic.WELL, ["ANY ET AL OIL WELL #12", "WELL"]);
  assert.deepEqual(byMnemonic.BHT, ["35.5", "BOTTOM HOLE TEMPERATURE"], "only ~W is swapped");

  assert.equal(build({ version: "2.0", rows: ROWS, items }).well.name, "WELL");
});

test("a file with no VERS is read as 2.0, with a version-assumed caution", () => {
  const log = build({ version: null, rows: ROWS, items: [["W", "WELL", "", "WELL", "ANY ET AL"]] });
  assert.equal(log.well.name, "WELL", "read as 2.0, so nothing is swapped");
  assert.deepEqual(codes(log), ["version-assumed"]);
});

// --- the depth index -------------------------------------------------------------

test("the index's unit is read through an alias list", () => {
  const unitOf = (index: string, items: Spec["items"] = []) => build({ rows: ROWS, curves: [index, "GR.GAPI"], items }).depthUnit;
  for (const unit of ["M", "m", "METRES", "Meters", "метер", "м"]) assert.equal(unitOf(`DEPT.${unit}`), "m", unit);
  for (const unit of ["F", "FT", "ft", "FEET", "Foot"]) assert.equal(unitOf(`DEPT.${unit}`), "ft", unit);
  assert.equal(unitOf("DEPTH_MD.ft"), "ft", "any mnemonic with a depth unit is a depth");
});

test("a blank index unit is taken from STRT", () => {
  const log = build({ rows: ROWS, curves: ["DEPT.", "GR.GAPI"], items: [["W", "STRT", "FT", "100"]] });
  assert.equal(log.depthUnit, "ft");
  assert.deepEqual(codes(log), []);
});

test("DEPT, DEPTH or MD with a blank or unknown unit is read as metres, with a depth-unit-assumed caution", () => {
  for (const index of ["DEPT.", "DEPTH.", "md.", "DEPT..1IN", "DEPT.furlong", "TDEP..1IN", "XYZ."]) {
    const log = build({ rows: ROWS, curves: [index, "GR.GAPI"] });
    assert.equal(log.depthUnit, "m", index);
    assert.deepEqual(codes(log), ["depth-unit-assumed"], index);
  }
});

test("a time or index column as the index throws no depth", () => {
  for (const index of ["TIME.S", "ETIM.SEC", "TIME.HHMMSS", "DEPT.S", "INDEX.", "TIME.", "ETIM.furlong"]) {
    assert.throws(() => buildWellLog(doc({ rows: ROWS, curves: [index, "GR.GAPI"] }), "t.las"), /no depth/, index);
  }
});

test("a document with no curves throws no depth", () => {
  assert.throws(() => buildWellLog(doc({ rows: [], curves: [] }), "t.las"), /no depth/);
});

test("rows whose index isn't a number are dropped (row-dropped), and a file left with none throws", () => {
  const log = build({ rows: [[100, 1], ["nan", 2], ["x", 3], [100.5, 4]] });
  assert.deepEqual([...log.md], [100, 100.5]);
  assert.deepEqual(values(log, "GR"), [1, 4]);
  assert.deepEqual(log.warnings, [
    { code: "row-dropped", count: 2, message: "2 rows whose depth isn't a number were dropped" },
  ]);
  assert.equal(curve(log, "GR").values.length, 2);

  assert.throws(() => buildWellLog(doc({ rows: [["x", 1]] }), "t.las"), /no rows/);
  assert.throws(() => buildWellLog(doc({ rows: [] }), "t.las"), /no rows/);
});

test("data lines parseLas dropped are a row-dropped caution of their own", () => {
  const log = build({ rows: [[100, 1], ["x", 2]], droppedLines: 3 });
  const dropped = log.warnings.filter((w) => w.code === "row-dropped");
  assert.deepEqual(dropped.map((w) => w.count), [3, 1]);
  assert.match(dropped[0].message, /3 data lines with the wrong number of values were dropped/);
});

test("rows out of depth order are sorted (depth-sorted note), and repeated depths keep the first", () => {
  const log = build({ rows: [[101, 3], [100, 1], [100.5, 2], [100.5, 9], [101, 8]] });
  assert.deepEqual([...log.md], [100, 100.5, 101]);
  assert.deepEqual(values(log, "GR"), [1, 2, 3]);
  assert.deepEqual(codes(log), ["depth-sorted", "duplicate-depth-dropped"]);
  assert.equal(warning(log, "duplicate-depth-dropped")?.count, 2);
});

test("a file stored deepest first, as LAS files often are, is sorted", () => {
  const log = build({ rows: [[101, 3], [100.5, 2], [100, 1]], items: [["W", "STEP", "M", "-0.5"]] });
  assert.deepEqual([...log.md], [100, 100.5, 101]);
  assert.deepEqual(codes(log), ["depth-sorted"], "a negative STEP matching the data isn't a mismatch");
});

// --- gaps and STEP -----------------------------------------------------------------

test("a gap row goes at the last sample's MD plus the median step, wherever a step exceeds 1.5 median steps", () => {
  const log = build({ rows: [[100, 1], [100.5, 2], [101, 3], [103, 4], [103.5, 5], [104, 6], [110, 7]] });
  assert.deepEqual([...log.md], [100, 100.5, 101, 101.5, 103, 103.5, 104, 104.5, 110]);
  assert.deepEqual(
    values(log, "GR").map((v) => (Number.isNaN(v) ? null : v)),
    [1, 2, 3, null, 4, 5, 6, null, 7],
  );
  assert.deepEqual(warning(log, "gap-inserted"), {
    code: "gap-inserted",
    count: 2,
    message: "2 gaps in the samples were marked so curves break across them",
  });
});

test("a step up to 1.5 median steps isn't a gap", () => {
  const log = build({ rows: [[100, 1], [100.5, 2], [101, 3], [101.75, 4]] });
  assert.equal(log.md.length, 4);
  assert.ok(!codes(log).includes("gap-inserted"));
});

test("gaps come from the data's median step, never STEP, and a STEP more than 1% off is a step-mismatch note", () => {
  const rows: Cell[][] = [[100, 1], [100.5, 2], [101, 3], [101.5, 4]];
  const withStep = (step: string) => build({ rows, items: [["W", "STEP", "M", step]] });

  const mismatched = withStep("0.1");
  assert.equal(mismatched.md.length, 4, "a STEP of 0.1 doesn't put a gap between every row");
  assert.deepEqual(codes(mismatched), ["step-mismatch"]);
  assert.match(mismatched.warnings[0].message, /STEP says 0\.1, but the data step by 0\.5/);

  assert.deepEqual(codes(withStep("0.504")), [], "within 1%");
  assert.deepEqual(codes(withStep("0.51")), ["step-mismatch"]);
  assert.deepEqual(codes(withStep("-0.5")), []);
  assert.deepEqual(codes(withStep("0")), [], "a zero STEP says nothing");
  assert.deepEqual(codes(withStep("")), []);
});

test("a single row has no step and no gaps", () => {
  const log = build({ rows: [[100, 1]], items: [["W", "STEP", "M", "0.5"]] });
  assert.deepEqual([...log.md], [100]);
  assert.deepEqual(codes(log), []);
});

// --- missing values ---------------------------------------------------------------

test("the declared NULL and −999.25, −9999.25 and −9999 are missing, matched within 1e-3", () => {
  const log = build({
    items: [["W", "NULL", "", "-1234.5"]],
    curves: ["DEPT.M", "A.", "B."],
    rows: [
      [100, -1234.5, -999.25],
      [100.5, -1234.5009, -9999.25],
      [101, -1234.502, -9999],
      [101.5, 7, -999.2495],
      [102, 8, -999.252],
    ],
  });
  const nulls = (key: string) => values(log, key).map((v) => (Number.isNaN(v) ? null : v));
  assert.deepEqual(nulls("A"), [null, null, Math.fround(-1234.502), 7, 8]);
  assert.deepEqual(nulls("B"), [null, null, null, null, Math.fround(-999.252)]);
  assert.deepEqual(
    log.warnings.map((w) => [w.code, w.curveKey, w.count]),
    [["sentinel-replaced", "A", 2], ["sentinel-replaced", "B", 4]],
  );
  assert.equal(log.warnings[0].message, "2 missing-value placeholders in A were replaced with no value");
});

test("+999.25 and other sign-flipped values stay data", () => {
  const log = build({ rows: [[100, 999.25], [100.5, 9999.25], [101, 9999]] });
  assert.deepEqual(values(log, "GR"), [999.25, 9999.25, 9999]);
  assert.deepEqual(codes(log), []);
});

test("missing values are never matched on the index", () => {
  const log = build({ items: [["W", "NULL", "", "999.25"]], rows: [[999, 999.25], [999.25, 1], [999.5, 2]] });
  assert.deepEqual([...log.md], [999, 999.25, 999.5]);
  assert.ok(Number.isNaN(values(log, "GR")[0]));
  assert.equal(warning(log, "sentinel-replaced", "GR")?.count, 1);
});

test("a NULL that isn't a number adds nothing to the missing values", () => {
  const log = build({ items: [["W", "NULL", "", "none"]], rows: [[100, 0], [100.5, -999.25]] });
  assert.deepEqual(values(log, "GR").map((v) => (Number.isNaN(v) ? null : v)), [0, null]);
});

test("nan, - and #N/A count as sentinel-replaced; other text is value-unreadable", () => {
  const log = build({
    curves: ["DEPT.M", "GR.GAPI", "RHOB.G/CC"],
    rows: [[100, "nan", "1.#INF"], [100.5, "-", "2,45"], [101, "#N/A", 2.5], [101.5, 40, "ERR"]],
  });
  assert.deepEqual(
    log.warnings.map((w) => [w.code, w.curveKey, w.count]),
    [["sentinel-replaced", "GR", 3], ["value-unreadable", "RHOB", 3]],
  );
  assert.equal(warning(log, "value-unreadable", "RHOB")?.message, "3 values in RHOB couldn't be read as a number and were left out");
});

test("values on dropped rows aren't counted", () => {
  const log = build({ rows: [[100, "nan"], [100, "ERR"], ["x", -999.25], [100.5, 1]] });
  assert.deepEqual(
    log.warnings.map((w) => [w.code, w.curveKey, w.count]),
    [["row-dropped", undefined, 1], ["duplicate-depth-dropped", undefined, 1], ["sentinel-replaced", "GR", 1]],
  );
});

test("a curve whose every value is unreadable is left out, and keeps a value-unreadable caution", () => {
  const log = build({ rows: [[100, "1,5"], [100.5, "2,5"], [101, -999.25]] });
  assert.deepEqual(log.curves, []);
  assert.deepEqual(log.warnings, [
    { code: "curve-empty", message: "GR has no values, so it was left out" },
    { code: "value-unreadable", count: 2, message: "2 values in GR couldn't be read as a number, and GR was left out" },
  ]);
});

test("a curve with no values is left out, with a curve-empty note naming its mnemonic", () => {
  const log = build({ curves: ["DEPT.M", "GR.GAPI", "DT.US/F"], rows: [[100, 1, -999.25], [100.5, 2, "nan"]] });
  assert.deepEqual(log.curves.map((c) => c.key), ["GR"]);
  assert.deepEqual(log.warnings, [{ code: "curve-empty", message: "DT has no values, so it was left out" }]);
});

// --- header/data width --------------------------------------------------------------

test("k < N: when every line has fewer values than curves, the first k curves are kept", () => {
  const log = build({ curves: ["DEPTH.F", "TVD.F", "VS.F", "Gamma.CPM", "ROP.Ft/Hr", "TEMP.F"], rows: [[19160, 10415.2, 8974.9, 57]] });
  assert.deepEqual(log.curves.map((c) => c.key), ["TVD", "VS", "Gamma"]);
  assert.deepEqual(log.warnings, [
    { code: "curves-dropped", count: 2, message: "Every data line has 4 values for 6 curves, so ROP, TEMP were left out" },
  ]);
});

test("k > N: when every line has more values than curves, the extra columns are ignored", () => {
  const log = build({ rows: [[100, 1, 99, 98], [100.5, 2, 99, 98]] });
  assert.deepEqual(log.curves.map((c) => c.key), ["GR"]);
  assert.deepEqual(values(log, "GR"), [1, 2]);
  assert.deepEqual(log.warnings, [
    { code: "columns-ignored", count: 2, message: "Every data line has 4 values for 2 curves, so the last 2 columns were ignored" },
  ]);
});

// --- curves -----------------------------------------------------------------------------

test("curves keep mnemonic, unit and description as written, and get a family from the shared table", () => {
  const d = doc({ curves: ["DEPT.M", "gr.GAPI", "ILD.OHMM", "XYZ.mV", "FOO.bar"], rows: [[100, 1, 2, 3, 4]] });
  const described = { ...d, curves: d.curves.map((c, i) => (i === 1 ? { ...c, description: "1  Gamma Ray" } : c)) };
  const log = buildWellLog(described, "w.las");
  assert.deepEqual(
    log.curves.map((c) => [c.key, c.mnemonic, c.unit, c.kind, c.family]),
    [
      ["gr", "gr", "GAPI", "continuous", "gamma-ray"],
      ["ILD", "ILD", "OHMM", "continuous", "resistivity-deep"],
      ["XYZ", "XYZ", "mV", "continuous", "sp"],
      ["FOO", "FOO", "bar", "continuous", "unknown"],
    ],
  );
  assert.equal(log.curves[0].description, "1  Gamma Ray");
  assert.deepEqual(log.zoneSets, []);
});

test("a TVD or TVDSS column stays an ordinary curve", () => {
  const log = build({ curves: ["DEPT.M", "TVD.M", "TVDSS.M"], rows: [[100, 99, 80], [100.5, 99.4, 80.4]] });
  assert.equal(log.tvdss, undefined);
  assert.deepEqual(log.curves.map((c) => c.key), ["TVD", "TVDSS"]);
});

test("duplicate mnemonics get :2, :3 keys, each with a duplicate-mnemonic-renamed note", () => {
  const log = build({ curves: ["DEPT.M", "SFLU.OHMM", "SFLU.OHMM", "SFLU.OHMM"], rows: [[100, 1, 2, 3]] });
  assert.deepEqual(log.curves.map((c) => [c.key, c.mnemonic]), [["SFLU", "SFLU"], ["SFLU:2", "SFLU"], ["SFLU:3", "SFLU"]]);
  assert.deepEqual(
    log.warnings.map((w) => [w.code, w.curveKey, w.message]),
    [
      ["duplicate-mnemonic-renamed", "SFLU:2", "A second curve named SFLU was renamed SFLU:2"],
      ["duplicate-mnemonic-renamed", "SFLU:3", "A second curve named SFLU was renamed SFLU:3"],
    ],
  );
});

test("a blank mnemonic gets the key UNKNOWN, then UNKNOWN:2, with family unknown and no warning", () => {
  const log = build({ curves: ["DEPT.M", ".GAPI", "GR.GAPI", ".OHMM"], rows: [[100, 1, 2, 3]] });
  assert.deepEqual(
    log.curves.map((c) => [c.key, c.mnemonic, c.family]),
    [["UNKNOWN", "", "unknown"], ["GR", "GR", "gamma-ray"], ["UNKNOWN:2", "", "unknown"]],
  );
  assert.deepEqual(codes(log), []);
});

test("a lithology curve of whole numbers is discrete", () => {
  const log = build({ curves: ["DEPT.M", "FORCE_2020_LITHOFACIES_LITHOLOGY."], rows: [[100, 65000], [100.5, -999.25], [101, 30000]] });
  const lithology = curve(log, "FORCE_2020_LITHOFACIES_LITHOLOGY");
  assert.equal(lithology.kind, "discrete");
  assert.equal(lithology.family, "lithology");
  assert.equal(lithology.codes, undefined, "a LAS file carries no code labels");
});

test("a lithology curve with non-integer values is continuous, with a discrete-read-as-continuous caution", () => {
  const log = build({ curves: ["DEPT.M", "FORCE_2020_LITHOFACIES_LITHOLOGY."], rows: [[100, 65000], [100.5, 65000.5]] });
  const key = "FORCE_2020_LITHOFACIES_LITHOLOGY";
  assert.equal(curve(log, key).kind, "continuous");
  assert.deepEqual(log.warnings.map((w) => [w.code, w.curveKey]), [["discrete-read-as-continuous", key]]);
});

test("only lithology is discrete; whole-number curves of other families stay continuous", () => {
  const log = build({ rows: [[100, 50], [100.5, 60]] });
  assert.equal(curve(log, "GR").kind, "continuous");
});

// --- every warning code ----------------------------------------------------------------------

test("every LAS load warning code comes out at its severity, per curve where the spec says so", () => {
  const logs = [
    build({ version: null, curves: ["DEPT.", "GR.GAPI", "GR.GAPI", "FORCE_2020_LITHOFACIES_LITHOLOGY.", "DT.US/F", "X.", "Y."], items: [["W", "STEP", "M", "0.1"]], rows: [
      [101, 1, 2, 0.5, -999.25, "nan", "ERR"],
      [100, 1, 2, 1, -999.25, 3, 4],
      [100, 1, 2, 1, -999.25, 3, 4],
      [100.5, 1, 2, 1, -999.25, 3, 4],
      [110, 1, 2, 1, -999.25, 3, 4],
      ["x", 1, 2, 1, -999.25, 3, 4],
    ], droppedLines: 1 }),
    build({ curves: ["DEPT.M", "A.", "B.", "C."], rows: [[100, 1]] }),
    build({ curves: ["DEPT.M"], rows: [[100, 1]] }),
  ];
  const all: LoadWarning[] = logs.flatMap((log) => log.warnings);
  const severities = Object.fromEntries(all.map((w) => [w.code, [severityOf(w.code), w.curveKey !== undefined]]));
  assert.deepEqual(severities, {
    "version-assumed": ["caution", false],
    "depth-unit-assumed": ["caution", false],
    "row-dropped": ["caution", false],
    "depth-sorted": ["note", false],
    "duplicate-depth-dropped": ["caution", false],
    "gap-inserted": ["note", false],
    "step-mismatch": ["note", false],
    "curve-empty": ["note", false],
    "duplicate-mnemonic-renamed": ["note", true],
    "discrete-read-as-continuous": ["caution", true],
    "sentinel-replaced": ["note", true],
    "value-unreadable": ["caution", true],
    "curves-dropped": ["caution", false],
    "columns-ignored": ["caution", false],
  });
});
