/**
 * buildWellLog(doc, fileName) → WellLog: the LAS log adapter's contract step
 * (#32, #34). Pure and DOM-free.
 *
 *   - version: no `VERS` is read as 2.0 (`version-assumed`); 1.2 swaps the
 *     value and description of `~W` items other than STRT/STOP/STEP/NULL;
 *   - identity: WELL, else the file name; UWI, else API, else the name;
 *   - the depth index: the first `~C` curve, its unit through an alias list
 *     (`depth-unit-assumed` for a blank or unknown one, a throw for a time);
 *   - header/data width mismatches (`curves-dropped`, `columns-ignored`) and
 *     dropped lines and rows (`row-dropped`);
 *   - sorting (`depth-sorted`) and repeated depths (`duplicate-depth-dropped`);
 *   - gap rows from the median step (`gap-inserted`, `step-mismatch`);
 *   - missing values, never on the index (`sentinel-replaced`,
 *     `value-unreadable`), and empty curves left out (`curve-empty`);
 *   - keys (`duplicate-mnemonic-renamed`), families and kind
 *     (`discrete-read-as-continuous`).
 *
 * It throws only when no well log can be produced: no depth index, or no rows.
 */

import {
  curveFamilyOf,
  type Curve,
  type DepthUnit,
  type HeaderItem,
  type LoadWarning,
  type WellLog,
} from "../core/index.ts";
import type { LasDocument, LasHeaderItem } from "./parse.ts";
import { TOKEN_MISSING, TOKEN_UNREADABLE } from "./scan.ts";

/** The spec's common missing values, matched besides the declared NULL. */
const COMMON_NULLS = [-999.25, -9999.25, -9999];
const NULL_TOLERANCE = 1e-3;

/** A gap is a step longer than this many median steps. */
const GAP_FACTOR = 1.5;
/** STEP may differ from the median step by this share before it is noted. */
const STEP_TOLERANCE = 0.01;

const METRES = new Set(["m", "meter", "meters", "metre", "metres", "м", "метр", "метров", "метер"]);
const FEET = new Set(["f", "ft", "feet", "foot", "фут"]);
/** Index units that say the index isn't a depth. */
const NOT_DEPTH = new Set(["s", "sec", "secs", "second", "seconds", "ms", "min", "h", "hr", "hhmmss", "hh:mm:ss", "time", "date", "datetime", "index", "idx", "sample", "samples"]);
/** Index mnemonics that say the index isn't a depth, whatever its unit. */
const NOT_DEPTH_MNEMONICS = new Set(["TIME", "ETIM", "DATE", "INDEX"]);
/** 1.2 `~W` items that keep their value in the value field. */
const UNSWAPPED_12 = new Set(["STRT", "STOP", "STEP", "NULL"]);

/** An inserted gap row in the row order. */
const GAP = -1;

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** "was" for one, "were" for any other count. */
function were(count: number): string {
  return count === 1 ? "was" : "were";
}

function findItem(items: readonly HeaderItem[], mnemonic: string): HeaderItem | undefined {
  return items.find((h) => h.mnemonic.toUpperCase() === mnemonic);
}

function findValue(items: readonly HeaderItem[], mnemonic: string): string {
  return findItem(items, mnemonic)?.value.trim() ?? "";
}

/** The version as a number, with a `version-assumed` caution when there is none. */
function versionOf(doc: LasDocument, warnings: LoadWarning[]): number {
  const version = doc.version === null ? NaN : Number(doc.version);
  if (Number.isFinite(version)) return version;
  warnings.push({
    code: "version-assumed",
    message:
      doc.version === null
        ? "The file doesn't say which LAS version it is, so it was read as LAS 2.0"
        : `The file's LAS version "${doc.version}" isn't a number, so it was read as LAS 2.0`,
  });
  return 2;
}

/** `~V`, `~W` and `~P` items in file order, with 1.2's `~W` value and description swapped. */
function headerOf(doc: LasDocument, version: number): HeaderItem[] {
  return doc.items.map(({ section, mnemonic, unit, value, description }) =>
    version < 2 && section === "W" && !UNSWAPPED_12.has(mnemonic.toUpperCase())
      ? { mnemonic, unit, value: description, description: value }
      : { mnemonic, unit, value, description },
  );
}

function stem(fileName: string): string {
  const base = fileName.replace(/^.*[\\/]/, "");
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(0, dot) : base;
}

/**
 * The index's depth unit, or a throw when it is a time or an index. Any
 * other unit that isn't metres or feet is read as metres, with a
 * `depth-unit-assumed` caution.
 */
function depthUnitOf(index: LasHeaderItem, header: readonly HeaderItem[], warnings: LoadWarning[]): DepthUnit {
  const strtUnit = findItem(header, "STRT")?.unit ?? "";
  const raw = (index.unit.trim() || strtUnit.trim()).toLowerCase();
  if (METRES.has(raw)) return "m";
  if (FEET.has(raw)) return "ft";

  const name = index.mnemonic || "(no mnemonic)";
  if (NOT_DEPTH.has(raw) || NOT_DEPTH_MNEMONICS.has(index.mnemonic.toUpperCase())) {
    throw new Error(
      `This file has no depth: its first curve, ${name}${raw ? ` in ${raw}` : ""}, isn't a depth in metres or feet`,
    );
  }
  warnings.push({
    code: "depth-unit-assumed",
    message: raw
      ? `The depth unit "${index.unit || strtUnit}" isn't metres or feet, so depths were read as metres`
      : "The file doesn't give a depth unit, so depths were read as metres",
  });
  return "m";
}

/**
 * Source rows in depth order: every row whose index is a number, sorted
 * (stable), the first of any repeated depth kept.
 */
function rowOrder(index: Float64Array, warnings: LoadWarning[]): number[] {
  const rows: number[] = [];
  for (let i = 0; i < index.length; i++) if (Number.isFinite(index[i])) rows.push(i);

  const unreadable = index.length - rows.length;
  if (unreadable > 0) {
    warnings.push({
      code: "row-dropped",
      count: unreadable,
      message: `${plural(unreadable, "row")} whose depth isn't a number ${were(unreadable)} dropped`,
    });
  }

  if (rows.some((row, k) => k > 0 && index[row] < index[rows[k - 1]])) {
    rows.sort((a, b) => index[a] - index[b] || a - b);
    warnings.push({ code: "depth-sorted", message: "The rows weren't in increasing depth order and have been sorted" });
  }

  const unique = rows.filter((row, k) => k === 0 || index[row] !== index[rows[k - 1]]);
  const repeated = rows.length - unique.length;
  if (repeated > 0) {
    warnings.push({
      code: "duplicate-depth-dropped",
      count: repeated,
      message: `${plural(repeated, "row")} at a repeated depth ${were(repeated)} dropped; the first at each depth was kept`,
    });
  }
  return unique;
}

function medianStep(index: Float64Array, rows: readonly number[]): number {
  if (rows.length < 2) return NaN;
  const steps = new Float64Array(rows.length - 1);
  for (let k = 1; k < rows.length; k++) steps[k - 1] = index[rows[k]] - index[rows[k - 1]];
  steps.sort();
  const m = steps.length;
  return m % 2 ? steps[(m - 1) >> 1] : (steps[m / 2 - 1] + steps[m / 2]) / 2;
}

/** The output rows: each a source row, or GAP after any step longer than 1.5 median steps. */
function withGapRows(index: Float64Array, rows: readonly number[], step: number): number[] {
  if (!(step > 0)) return [...rows];
  const out: number[] = [];
  rows.forEach((row, k) => {
    out.push(row);
    if (k < rows.length - 1 && index[rows[k + 1]] - index[row] > GAP_FACTOR * step) out.push(GAP);
  });
  return out;
}

/** A unique key per curve: the mnemonic (UNKNOWN when blank), then `:2`, `:3`. */
function keyOf(mnemonic: string, used: Set<string>): string {
  const base = mnemonic === "" ? "UNKNOWN" : mnemonic;
  let key = base;
  for (let k = 2; used.has(key); k++) key = `${base}:${k}`;
  used.add(key);
  return key;
}

export function buildWellLog(doc: LasDocument, fileName: string): WellLog {
  const warnings: LoadWarning[] = [];
  const perCurve: LoadWarning[] = [];

  const version = versionOf(doc, warnings);
  const header = headerOf(doc, version);
  const name = findValue(header, "WELL") || stem(fileName);
  const id = findValue(header, "UWI") || findValue(header, "API") || name;

  const [indexItem, ...curveItems] = doc.curves;
  if (!indexItem) throw new Error("This file defines no curves, so it has no depth");
  const depthUnit = depthUnitOf(indexItem, header, warnings);

  // Header/data width: keep the curves the data has columns for.
  const { columns, nonNumeric } = doc.data;
  const width = columns.length;
  const declared = doc.curves.length;
  if (width < declared) {
    const dropped = doc.curves.slice(width).map((c) => c.mnemonic || "(no mnemonic)");
    warnings.push({
      code: "curves-dropped",
      count: dropped.length,
      message: `Every data line has ${width} values for ${declared} curves, so ${dropped.join(", ")} ${were(dropped.length)} left out`,
    });
  } else if (width > declared) {
    warnings.push({
      code: "columns-ignored",
      count: width - declared,
      message: `Every data line has ${width} values for ${declared} curves, so the last ${plural(width - declared, "column")} ${were(width - declared)} ignored`,
    });
  }
  if (doc.data.droppedLines > 0) {
    const lines = doc.data.droppedLines;
    warnings.push({
      code: "row-dropped",
      count: lines,
      message: `${plural(lines, "data line")} with the wrong number of values ${were(lines)} dropped`,
    });
  }

  // Rows: sorted, repeated depths dropped, gap rows inserted.
  const index = columns[0] ?? new Float64Array(0);
  const kept = rowOrder(index, warnings);
  if (kept.length === 0) throw new Error("This file has no rows of data with a depth");

  const step = medianStep(index, kept);
  const order = withGapRows(index, kept, step);
  const n = order.length;
  const md = Float64Array.from(order, (row, i) => (row === GAP ? index[order[i - 1]] + step : index[row]));
  const gaps = n - kept.length;
  if (gaps > 0) {
    warnings.push({
      code: "gap-inserted",
      count: gaps,
      message: `${plural(gaps, "gap")} in the samples ${were(gaps)} marked so curves break across ${gaps === 1 ? "it" : "them"}`,
    });
  }
  const declaredStep = Math.abs(Number(findValue(header, "STEP")));
  if (declaredStep > 0 && step > 0 && Math.abs(declaredStep - step) > STEP_TOLERANCE * step) {
    warnings.push({
      code: "step-mismatch",
      message: `STEP says ${declaredStep}, but the data step by ${step}; gaps were found from the data's step`,
    });
  }

  // Curves.
  const declaredNull = findValue(header, "NULL");
  const nulls = declaredNull !== "" && Number.isFinite(Number(declaredNull)) ? [Number(declaredNull), ...COMMON_NULLS] : COMMON_NULLS;
  const isNull = (v: number) => nulls.some((s) => Math.abs(v - s) <= NULL_TOLERANCE);

  const keys = new Set<string>();
  const curves: Curve[] = [];
  curveItems.slice(0, Math.max(0, width - 1)).forEach((item, k) => {
    const column = columns[k + 1];
    const flags = nonNumeric[k + 1];
    const values = new Float32Array(n);
    let replaced = 0;
    let unreadable = 0;
    let hasValue = false;
    let integers = true;
    for (let i = 0; i < n; i++) {
      const row = order[i];
      if (row === GAP) {
        values[i] = NaN;
        continue;
      }
      let v = column[row];
      if (flags && flags[row] === TOKEN_MISSING) replaced++;
      else if (flags && flags[row] === TOKEN_UNREADABLE) unreadable++;
      else if (isNull(v)) {
        replaced++;
        v = NaN;
      }
      if (!Number.isNaN(v)) {
        hasValue = true;
        if (!Number.isInteger(v)) integers = false;
      }
      values[i] = v;
    }

    const mnemonic = item.mnemonic;
    if (!hasValue) {
      const label = mnemonic || "A curve with no mnemonic";
      warnings.push({ code: "curve-empty", message: `${label} has no values, so it was left out` });
      // The curve isn't in the well log, so this caution can't name it by
      // key; without it, a file of comma decimals would lose curves quietly.
      if (unreadable > 0) {
        warnings.push({
          code: "value-unreadable",
          count: unreadable,
          message: `${plural(unreadable, "value")} in ${label} couldn't be read as a number, and ${label} was left out`,
        });
      }
      return;
    }

    const key = keyOf(mnemonic, keys);
    const family = mnemonic === "" ? "unknown" : curveFamilyOf(mnemonic, item.unit);
    const lithology = family === "lithology";
    curves.push({
      key,
      mnemonic,
      unit: item.unit,
      description: item.description,
      kind: lithology && integers ? "discrete" : "continuous",
      family,
      values,
    });

    if (mnemonic !== "" && key !== mnemonic) {
      perCurve.push({
        code: "duplicate-mnemonic-renamed",
        curveKey: key,
        message: `A second curve named ${mnemonic} was renamed ${key}`,
      });
    }
    if (lithology && !integers) {
      perCurve.push({
        code: "discrete-read-as-continuous",
        curveKey: key,
        message: `${key} holds values that aren't whole-number codes, so it is drawn as a continuous curve`,
      });
    }
    if (replaced > 0) {
      perCurve.push({
        code: "sentinel-replaced",
        curveKey: key,
        count: replaced,
        message: `${plural(replaced, "missing-value placeholder")} in ${key} ${were(replaced)} replaced with no value`,
      });
    }
    if (unreadable > 0) {
      perCurve.push({
        code: "value-unreadable",
        curveKey: key,
        count: unreadable,
        message: `${plural(unreadable, "value")} in ${key} couldn't be read as a number and ${were(unreadable)} left out`,
      });
    }
  });

  return {
    well: { id, name },
    source: fileName,
    depthUnit,
    md,
    curves,
    zoneSets: [],
    header,
    warnings: [...warnings, ...perCurve],
  };
}
