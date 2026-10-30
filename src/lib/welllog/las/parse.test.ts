import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decodeLas } from "./decode.ts";
import { parseLas, splitHeaderLine, type LasDocument } from "./parse.ts";
import { TOKEN_MISSING, TOKEN_UNREADABLE } from "./scan.ts";

function read(name: string): LasDocument {
  return parseLas(decodeLas(readFileSync(new URL(`./fixtures/lasio/${name}`, import.meta.url))));
}

const mnemonics = (doc: LasDocument) => doc.curves.map((c) => c.mnemonic);
const column = (doc: LasDocument, j: number) => [...doc.data.columns[j]];
const item = (doc: LasDocument, mnemonic: string) => doc.items.find((h) => h.mnemonic === mnemonic);

// --- header lines ----------------------------------------------------------

test("header lines split at the first dot, the first space after it, and the value's colon", () => {
  const cases: [string, string, string, string, string][] = [
    // line, mnemonic, unit, value, description
    [" STRT.M        1670.000000:", "STRT", "M", "1670.000000", ""],
    ["STRT    .M               910.0000               :START DEPTH", "STRT", "M", "910.0000", "START DEPTH"],
    [" NULL.           -999.2500:", "NULL", "", "-999.2500", ""],
    [" WELL.                WELL:   ANY ET AL OIL WELL #12", "WELL", "", "WELL", "ANY ET AL OIL WELL #12"],
    [" DT  .US/M     \t\t     :  2  SONIC TRANSIT TIME", "DT", "US/M", "", "2  SONIC TRANSIT TIME"],
    // FORCE 2020: the colons inside the time have no space beside them.
    [
      "DATE.  2020-08-09 20:01:10   : Log Export Date {yyyy-MM-dd HH:mm:ss}",
      "DATE", "", "2020-08-09 20:01:10", "Log Export Date {yyyy-MM-dd HH:mm:ss}",
    ],
    ["DATE. 2020-08-09 20:01:10 : Log Export Date {yyyy-MM-dd HH:mm:ss}", "DATE", "", "2020-08-09 20:01:10", "Log Export Date {yyyy-MM-dd HH:mm:ss}"],
    // lasio's test_read_header_line.py, where our rule agrees with lasio.
    ["TIML.hh:mm 23:15 23-JAN-2001:   Time Logger: At Bottom", "TIML", "hh:mm", "23:15 23-JAN-2001", "Time Logger: At Bottom"],
    ["STRT.DateTime 2012-09-16T07:44:12-05:00 : START DEPTH", "STRT", "DateTime", "2012-09-16T07:44:12-05:00", "START DEPTH"],
    [" DEPT.метер                      :  1  DEPTH", "DEPT", "метер", "", "1  DEPTH"],
    [" TDEP  ..1IN                      :  0.1-in", "TDEP", ".1IN", "", "0.1-in"],
    ["RUN . 01: RUN NUMBER", "RUN", "", "01", "RUN NUMBER"],
    ["QI     .      :         Survey quality: GOOD or BAD versus criteria", "QI", "", "", "Survey quality: GOOD or BAD versus criteria"],
    ["              DRILLED  :12/11/2010", "DRILLED", "", "12/11/2010", ""],
    ["              HOLE DIA :85.7", "HOLE DIA", "", "85.7", ""],
    ["\t\t\t  TIME     :14:00:32", "TIME", "", "14:00:32", ""],
    // No colon with a space beside it: the last colon ends the value.
    ["TIME.hh:mm:ss 12:00:00:Start", "TIME", "hh:mm:ss", "12:00:00", "Start"],
    // No colon at all: everything after the unit is the value.
    [" DEPT.M      ", "DEPT", "M", "", ""],
    [" GR.GAPI 45.5", "GR", "GAPI", "45.5", ""],
    // A blank mnemonic stays blank.
    [" .OHMM                   :  5  RXO RESISTIVITY", "", "OHMM", "", "5  RXO RESISTIVITY"],
    // Departures from lasio, by the spec's first-dot and first-space rules:
    // a dot in the mnemonic ends it, and a space in the unit ends the unit.
    ["I. Res..OHM-M                  ", "I", "", "Res..OHM-M", ""],
    ["HKLA            .1000 lbf                                  :(RT)", "HKLA", "1000", "lbf", "(RT)"],
  ];
  for (const [line, mnemonic, unit, value, description] of cases) {
    assert.deepEqual(splitHeaderLine(line), { mnemonic, unit, value, description }, line);
  }
});

test("a line with neither a dot nor a colon isn't a header item", () => {
  assert.equal(splitHeaderLine("just some words"), null);
});

// --- versions and sections -------------------------------------------------

test("a 1.2 file is read as written, with its ~W value and description where the file has them", () => {
  const doc = read("1.2/sample.las");
  assert.equal(doc.version, "1.2");
  assert.equal(doc.wrap, false);
  assert.deepEqual(item(doc, "WELL"), { section: "W", mnemonic: "WELL", unit: "", value: "WELL", description: "ANY ET AL OIL WELL #12" });
  assert.deepEqual(mnemonics(doc), ["DEPT", "DT", "RHOB", "NPHI", "SFLU", "SFLA", "ILM", "ILD"]);
  assert.deepEqual(column(doc, 0), [1670, 1669.875, 1669.75]);
  assert.deepEqual(column(doc, 1), [123.45, 123.45, 123.45]);
  assert.equal(doc.data.rows, 3);
});

test("2.0 and 2.1 files are read", () => {
  for (const [name, version] of [["2.0/sample_2.0.las", "2.0"], ["sample_2.1.las", "2.1"]]) {
    const doc = read(name);
    assert.equal(doc.version, version);
    assert.equal(item(doc, "WELL")?.value, "AAAAA_2");
    assert.equal(doc.data.rows, 3);
    assert.equal(doc.data.columns.length, 8);
  }
});

test("a LAS 3.0 file throws, naming the version", () => {
  assert.throws(() => read("3.0/sample_3.0.las"), /LAS 3\.0/);
});

test("header items keep their sections in file order; ~O and custom sections are dropped", () => {
  const doc = read("non-standard-header-sections.las");
  assert.deepEqual(
    doc.items.map((h) => `${h.section} ${h.mnemonic}`),
    [
      ...["V VERS", "V WRAP", "W STRT", "W STOP", "W STEP", "W NULL", "W COMP", "W WELL", "W FLD", "W LOC"],
      ...["W PROV", "W SRVC", "W DATE", "W UWI", "P BHT", "P BS", "P FD"],
    ],
  );
  assert.equal(item(doc, "BHT")?.value, "35.5000");
  assert.equal(doc.curves.length, 8);
});

test("custom sections are told from standard ones by name, not by their first letter", () => {
  const text = [
    "~Version", "VERS. 2.0 :", "~CURVES", "DEPT.M :", "GR.GAPI :",
    "~Core_Data", "POR.PU 12 : core porosity", "~Additional_Info", "NOTE. 1 : not data",
    "~Param", "BHT.DEGC 35 :", "~A  DEPT GR", "100 50",
  ].join("\n");
  const doc = parseLas(text);
  assert.deepEqual(doc.curves.map((c) => c.mnemonic), ["DEPT", "GR"]);
  assert.deepEqual(doc.items.map((h) => `${h.section} ${h.mnemonic}`), ["V VERS", "P BHT"]);
  assert.equal(doc.data.rows, 1);
});

test("a file without VERS has a null version, and one without WRAP is unwrapped", () => {
  assert.equal(read("missing_vers.las").version, null);
  const noWrap = read("missing_wrap.las");
  assert.equal(noWrap.wrap, false);
  assert.equal(noWrap.data.rows, 3);
});

test("comment lines in the data section are skipped", () => {
  const doc = read("skip_data_section_comments.las");
  assert.equal(doc.data.rows, 4);
  assert.deepEqual(column(doc, 0), [0.3, 0.4, 0.5, 0.6]);
});

test("tab-delimited data and CR-only line breaks read the same values", () => {
  const plain = read("2.0/sample_2.0.las");
  for (const name of ["2.0/sample_2.0_tab_dlm.las", "2.0/sample_2.0_universal_newline.las"]) {
    const doc = read(name);
    assert.deepEqual(doc.data.columns, plain.data.columns, name);
    assert.deepEqual(mnemonics(doc), mnemonics(plain), name);
  }
});

test("curve lines with no colon are still curves", () => {
  const doc = read("sparse_curves.las");
  assert.deepEqual(mnemonics(doc), ["DEPT", "DT", "RHOB", "NPHI", "SFLU", "SFLA", "ILM", "ILD"]);
  assert.equal(doc.curves[0].unit, "M");
});

test("an ~A section with no data lines has no rows", () => {
  const doc = read("missing_a_section.las");
  assert.equal(doc.data.rows, 0);
});

test("a file with no ~A section throws", () => {
  assert.throws(() => parseLas("~Version\nVERS. 2.0 :\n~Curve\nDEPT.M :\n"), /no ~A section/);
});

// --- wrapped files ---------------------------------------------------------

test("wrapped files are read as one token stream, cut every curve count", () => {
  for (const name of ["1.2/sample_wrapped.las", "2.0/sample_2.0_wrapped.las"]) {
    const doc = read(name);
    assert.equal(doc.wrap, true, name);
    assert.equal(doc.curves.length, 36, name);
    assert.equal(doc.data.columns.length, 36, name);
    assert.deepEqual(column(doc, 0).slice(0, 2), [910, 909.875], name);
    assert.deepEqual(column(doc, 2).slice(0, 2), [2692.7075, 2712.646], name);
    assert.deepEqual(column(doc, 35).slice(0, 2), [0, 0], name);
  }
  assert.equal(read("1.2/sample_wrapped.las").data.rows, 5);
  assert.equal(read("2.0/sample_2.0_wrapped.las").data.rows, 2);
});

test("a wrapped file whose token count isn't a multiple of the curves throws", () => {
  const text = "~V\nVERS. 2.0 :\nWRAP. YES :\n~C\nDEPT.M :\nGR.GAPI :\nRHOB.G/CC :\n~A\n100\n1 2\n101\n3\n";
  assert.throws(() => parseLas(text), /5 data values.*rows of 3 curves/);
});

// --- missing values and non-numeric data ------------------------------------

test("NULL values are kept as written; parseLas replaces nothing", () => {
  const doc = read("missing_null.las");
  assert.equal(item(doc, "NULL"), undefined);
  assert.deepEqual(column(doc, 1), [-999.25, -999.25, 123.45]);

  const indexNull = read("index_null.las");
  assert.equal(item(indexNull, "NULL")?.value, "999.25");
  assert.deepEqual(column(indexNull, 0), [999, 999.25, 999.5]);
  assert.deepEqual(column(indexNull, 1), [999.25, 123.45, 123.45]);
});

test("spelled-out markers and unreadable tokens become NaN, marked by what they were", () => {
  const dashes = read("null_policy_dashes.las");
  const rhob = column(dashes, 2);
  assert.ok(Number.isNaN(rhob[0]) && Number.isNaN(rhob[2]));
  assert.equal(rhob[1], -2550, "a sign-flipped value is data");
  assert.deepEqual([...(dashes.data.nonNumeric[2] ?? [])], [TOKEN_MISSING, 0, TOKEN_UNREADABLE]);
  assert.equal(dashes.data.nonNumeric[1], undefined, "a column with only numbers has no marks");

  const err = read("null_policy_ERR.las");
  assert.deepEqual([...(err.data.nonNumeric[2] ?? [])], [0, 0, TOKEN_UNREADABLE]);
});

test("comma decimals are unreadable, not read as their whole part", () => {
  const doc = read("comma_decimal_mark.las");
  const sflu = column(doc, 4);
  assert.equal(sflu[0], 123.45);
  assert.ok(Number.isNaN(sflu[1]));
  assert.deepEqual([...(doc.data.nonNumeric[4] ?? [])], [0, TOKEN_UNREADABLE, 0]);
});

test("a time index is read as written", () => {
  const doc = read("data_characters.las");
  assert.deepEqual(mnemonics(doc), ["TIME", "DATE", "DEPT", "GR_UNC_RT"]);
  assert.equal(doc.curves[0].unit, "HHMMSS");
  assert.deepEqual([...(doc.data.nonNumeric[0] ?? [])], [TOKEN_UNREADABLE, TOKEN_UNREADABLE]);
  assert.deepEqual(column(doc, 2), [1500.2435, 1500.3519]);
});

// --- mnemonics ---------------------------------------------------------------

test("duplicate and blank mnemonics are read as written", () => {
  assert.deepEqual(mnemonics(read("mnemonic_duplicate.las")), ["DEPT", "DT", "RHOB", "NPHI", "SFLU", "SFLU", "ILM", "ILD"]);
  assert.deepEqual(mnemonics(read("mnemonic_missing_multiple.las")), ["DEPT", "DT", "RHOB", "NPHI", "", "", "ILM", "ILD"]);
});

// --- encodings -----------------------------------------------------------------

test("every encoding fixture reads the same curves", () => {
  const names = ["encodings_utf8.las", "encodings_utf8wbom.las", "encodings_utf16lebom.las", "encodings_utf16bebom.las"];
  for (const name of names) {
    const doc = read(name);
    assert.deepEqual(mnemonics(doc), ["DEPT", "DT", "ºᶟᵌᴬń", "NPHI", "SFLU", "SFLA", "ILM", "ILD"], name);
    assert.equal(item(doc, "BHT")?.unit, "ºᶟᵌᴬń", name);
    assert.equal(doc.data.rows, 3, name);
  }
  assert.equal(read("encodings_cp1252.las").data.rows, 3);
});

// --- index and STRT/STOP --------------------------------------------------------

test("the index is the first curve, with its unit as written, whatever STRT says", () => {
  assert.equal(read("autodepthindex_F.las").curves[0].unit, "F");
  assert.equal(read("autodepthindex_FEET.las").curves[0].unit, "FEET");
  const mixed = read("autodepthindex_M_FT.las");
  assert.equal(mixed.curves[0].unit, "M");
  assert.equal(item(mixed, "STOP")?.unit, "F");
  assert.equal(read("sample_cyrillic_depth_unit.las").curves[0].unit, "метер");
  assert.deepEqual(column(read("autodepthindex_F.las"), 0).slice(0, 3), [0, 1, 2]);
});

test("a repeated STEP line is kept twice, as written", () => {
  const doc = read("duplicate_step.las");
  assert.equal(doc.items.filter((h) => h.mnemonic === "STEP").length, 2);
});

// --- data lines that don't match the curves ---------------------------------

test("when every line has fewer values than curves, the data are as wide as the lines", () => {
  const doc = read("excess_curves.las");
  assert.equal(doc.curves.length, 6);
  assert.equal(doc.data.columns.length, 4);
  assert.equal(doc.data.droppedLines, 0);
  assert.deepEqual(column(doc, 3), [57.011, 57.011]);
});

test("when every line has more values than curves, the data are as wide as the lines", () => {
  const doc = read("missing_vers.las");
  assert.equal(doc.data.columns.length, doc.curves.length);
  const wide = parseLas("~V\nVERS. 2.0 :\n~C\nDEPT.M :\nGR.GAPI :\n~A\n1 2 3\n2 4 5\n");
  assert.equal(wide.data.columns.length, 3);
  assert.deepEqual(column(wide, 2), [3, 5]);
});

test("in an unwrapped file with mixed line lengths, lines that don't match the curves are dropped", () => {
  const doc = parseLas("~V\nVERS. 2.0 :\n~C\nDEPT.M :\nGR.GAPI :\n~A\n1 10\n2 20 99\n3\n4 nan\n5 x 6\n6 60\n");
  assert.equal(doc.data.droppedLines, 3);
  assert.deepEqual(column(doc, 0), [1, 4, 6]);
  assert.deepEqual([...(doc.data.nonNumeric[1] ?? [])], [0, TOKEN_MISSING, 0], "marks follow the kept rows");
});
