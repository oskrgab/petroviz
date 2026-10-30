/**
 * build(columns) → WellLog: the FORCE 2020 log adapter's contract step.
 *
 * Takes one well's decoded columns, as `decode` returns them, and applies the
 * well log contract (ADR-0002) in the spec's order:
 *
 *   1. sort by MD (`depth-sorted`);
 *   2. drop repeated depths (`duplicate-depth-dropped`);
 *   3. TVDSS = −Z_LOC, dropped if it isn't monotonic (`tvdss-not-monotonic`);
 *   4. a gap row wherever a step exceeds 1.5 × 0.152 m (`gap-inserted`);
 *   5. float32-tolerant sentinel replacement, never on depths (`sentinel-replaced`);
 *   6. all-NULL columns dropped silently (a column of nothing but
 *      sentinels is dropped too, with a `curve-empty` note);
 *   7. GROUP and FORMATION zone sets, a run broken only by a gap kept as one;
 *   8. lithology as a discrete curve with labels;
 *   9. curve families from the shared mnemonic table.
 *
 * Pure: no fetching, no DOM.
 */

import {
  curveFamilyOf,
  type Curve,
  type DepthUnit,
  type LoadWarning,
  type WellLog,
  type Zone,
  type ZoneSet,
} from "../../welllog/core/index.ts";
import type { ForceColumns, ForceValue } from "./decode.ts";

export interface ForceWellMeta {
  /** The well's file stem, e.g. `34-10-16_R`. */
  readonly id: string;
  /** Column name → unit, from the dataset's `schema.json`. */
  readonly units: Readonly<Record<string, string | null | undefined>>;
  /** Lithology code (as a string) → label, from `schema.json`. */
  readonly lithologyLabels: Readonly<Record<string, string>>;
}

/** FORCE 2020's nominal sampling step, in metres. */
const FORCE_STEP = 0.152;
const GAP_STEP = 1.5 * FORCE_STEP;

/** Upstream missing-value placeholders, as the petrodb dataset README lists them. */
const SENTINELS = [-999, -999.25, -999.9];
/** Wide enough for float32 copies (−999.9000244, −999.2501221), far below any real step in value. */
const SENTINEL_TOLERANCE = 1e-3;

const LITHOLOGY = "FORCE_2020_LITHOFACIES_LITHOLOGY";
const ZONE_COLUMNS = ["GROUP", "FORMATION"];
const NOT_CURVES = new Set(["WELL", "DEPTH_MD", "X_LOC", "Y_LOC", "Z_LOC", "dataset", ...ZONE_COLUMNS]);

function toNumber(value: ForceValue): number {
  if (value === null || value === undefined) return NaN;
  return typeof value === "number" ? value : Number(value);
}

function isSentinel(value: number): boolean {
  return SENTINELS.some((s) => Math.abs(value - s) <= SENTINEL_TOLERANCE);
}

/**
 * Row order: every source row with a finite MD, sorted by MD (stable), the
 * first of any repeated depth kept.
 */
function rowOrder(md: ArrayLike<ForceValue>, warnings: LoadWarning[]): number[] {
  const rows: number[] = [];
  for (let i = 0; i < md.length; i++) if (Number.isFinite(toNumber(md[i]))) rows.push(i);

  const depth = (i: number) => toNumber(md[i]);
  if (rows.some((row, k) => k > 0 && depth(row) < depth(rows[k - 1]))) {
    rows.sort((a, b) => depth(a) - depth(b) || a - b);
    warnings.push({ code: "depth-sorted", message: "Samples were stored out of depth order and have been sorted by MD" });
  }

  const unique = rows.filter((row, k) => k === 0 || depth(row) !== depth(rows[k - 1]));
  const dropped = rows.length - unique.length;
  if (dropped > 0) {
    warnings.push({
      code: "duplicate-depth-dropped",
      count: dropped,
      message: `${dropped} samples at a repeated depth were dropped; the first at each depth was kept`,
    });
  }
  return unique;
}

/**
 * The output rows: each is a source row, or GAP for an inserted gap row,
 * which goes wherever a step between kept rows exceeds 1.5 steps.
 */
const GAP = -1;

function withGapRows(rows: readonly number[], depth: (row: number) => number): number[] {
  const out: number[] = [];
  rows.forEach((row, k) => {
    out.push(row);
    if (k < rows.length - 1 && depth(rows[k + 1]) - depth(row) > GAP_STEP) out.push(GAP);
  });
  return out;
}

function strictlyIncreasing(values: Float64Array): boolean {
  let previous = -Infinity;
  for (const v of values) {
    if (Number.isNaN(v)) continue;
    if (!(v > previous)) return false;
    previous = v;
  }
  return true;
}

/**
 * Runs of one name down the output rows. A gap row (`null` name, `isGap`)
 * doesn't end a run when the same name resumes after it.
 */
function zonesOf(md: Float64Array, names: readonly (string | null)[], isGap: (i: number) => boolean): Zone[] {
  const zones: Zone[] = [];
  const n = md.length;
  let i = 0;
  while (i < n) {
    const name = names[i];
    if (name === null) {
      i++;
      continue;
    }
    const top = md[i];
    let j = i + 1;
    while (j < n && (names[j] === name || (isGap(j) && names[j + 1] === name))) j++;
    zones.push({ name, top, base: j < n ? md[j] : md[n - 1] });
    i = j;
  }
  return zones;
}

export function build(columns: ForceColumns, meta: ForceWellMeta): WellLog {
  const warnings: LoadWarning[] = [];
  const sourceMd = columns.DEPTH_MD;
  if (!sourceMd) throw new Error(`Well ${meta.id} has no DEPTH_MD column`);
  const depth = (row: number) => toNumber(sourceMd[row]);

  // 1–2. Sort by MD and drop repeated depths.
  const kept = rowOrder(sourceMd, warnings);
  if (kept.length === 0) throw new Error(`Well ${meta.id} has no samples`);

  // Gap rows are placed now, so every column below is laid out on the same
  // rows, but recorded at step 4.
  const order = withGapRows(kept, depth);
  const n = order.length;
  const isGap = (i: number) => order[i] === GAP;
  const md = Float64Array.from(order, (row, i) => (row === GAP ? depth(order[i - 1]) + FORCE_STEP : depth(row)));
  function layOut<T extends Float32Array | Float64Array>(out: T, read: (row: number) => number): T {
    order.forEach((row, i) => (out[i] = row === GAP ? NaN : read(row)));
    return out;
  }

  // 3. TVDSS = −Z_LOC, NaN where NULL and at gap rows.
  let tvdss: Float64Array | undefined;
  const zLoc = columns.Z_LOC;
  if (zLoc) {
    const candidate = layOut(new Float64Array(n), (row) => -toNumber(zLoc[row]));
    if (!candidate.some((t) => !Number.isNaN(t))) {
      tvdss = undefined;
    } else if (strictlyIncreasing(candidate)) {
      tvdss = candidate;
    } else {
      warnings.push({
        code: "tvdss-not-monotonic",
        message: "TVDSS doesn't increase steadily with MD, so it was left out",
      });
    }
  }

  // 4. Gap rows.
  const gapCount = n - kept.length;
  if (gapCount > 0) {
    warnings.push({
      code: "gap-inserted",
      count: gapCount,
      message: `${gapCount} gaps in the samples were marked so curves break across them`,
    });
  }

  // 5–6, 8–9. Curves: sentinels replaced, empty columns dropped, lithology
  // discrete, families from the shared table.
  const curves: Curve[] = [];
  const replaced: LoadWarning[] = [];
  for (const name of Object.keys(columns)) {
    if (NOT_CURVES.has(name)) continue;
    const column = columns[name];
    const discrete = name === LITHOLOGY;

    let sentinels = 0;
    const values = layOut(new Float32Array(n), (row) => {
      const v = toNumber(column[row]);
      if (!discrete && isSentinel(v)) {
        sentinels++;
        return NaN;
      }
      return v;
    });
    if (!values.some((v) => !Number.isNaN(v))) {
      if (sentinels > 0) {
        warnings.push({
          code: "curve-empty",
          message: `${name} held only missing-value placeholders, so it was left out`,
        });
      }
      continue;
    }

    curves.push({
      key: name,
      mnemonic: name,
      unit: meta.units[name] ?? "",
      description: "",
      kind: discrete ? "discrete" : "continuous",
      family: curveFamilyOf(name),
      values,
      ...(discrete ? { codes: meta.lithologyLabels } : {}),
    });
    if (sentinels > 0) {
      replaced.push({
        code: "sentinel-replaced",
        curveKey: name,
        count: sentinels,
        message: `${sentinels} missing-value placeholders in ${name} were replaced with no value`,
      });
    }
  }
  warnings.push(...replaced);

  // 7. Zone sets.
  const zoneSets: ZoneSet[] = [];
  for (const setName of ZONE_COLUMNS) {
    const column = columns[setName];
    if (!column) continue;
    const names = order.map((row) => {
      const v = row === GAP ? null : column[row];
      return typeof v === "string" && v !== "" ? v : null;
    });
    const zones = zonesOf(md, names, isGap);
    if (zones.length > 0) zoneSets.push({ name: setName, zones });
  }

  const wellNames = columns.WELL;
  const firstName = wellNames && Array.prototype.find.call(wellNames, (v) => typeof v === "string" && v !== "");
  const depthUnit: DepthUnit = meta.units.DEPTH_MD === "ft" ? "ft" : "m";

  return {
    well: { id: meta.id, name: typeof firstName === "string" ? firstName : meta.id },
    source: "FORCE 2020",
    depthUnit,
    md,
    ...(tvdss ? { tvdss } : {}),
    curves,
    zoneSets,
    header: [],
    warnings,
  };
}
