/**
 * What the well panel shows, as plain data: the well's identity, and its load
 * warnings with cautions first and notes grouped one line per code (#34).
 */

import { severityOf, type LoadWarning, type LoadWarningCode, type WellLog } from "../core/index.ts";

export type IdentityRow = readonly [label: string, value: string];

export interface NoteGroup {
  readonly code: LoadWarningCode;
  readonly summary: string;
  /** The warnings behind the line, to expand into per-curve counts. */
  readonly items: readonly LoadWarning[];
}

export interface WarningSections {
  readonly cautions: readonly LoadWarning[];
  readonly notes: readonly NoteGroup[];
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** One-line summaries for notes that can repeat, by how many there are. */
const NOTE_SUMMARIES: Partial<Record<LoadWarningCode, (n: number) => string>> = {
  "sentinel-replaced": (n) => `Missing values replaced in ${plural(n, "curve", "curves")}`,
  "duplicate-mnemonic-renamed": (n) => `Repeated mnemonics renamed in ${plural(n, "curve", "curves")}`,
  "curve-empty": (n) => `${plural(n, "curve", "curves")} with no values left out`,
};

function range(values: ArrayLike<number>, unit: string): string | undefined {
  let first = NaN;
  let last = NaN;
  for (let i = 0; i < values.length; i++) {
    if (Number.isNaN(values[i])) continue;
    if (Number.isNaN(first)) first = values[i];
    last = values[i];
  }
  return Number.isNaN(first) ? undefined : `${first.toFixed(1)} – ${last.toFixed(1)} ${unit}`;
}

export function identityRows(log: WellLog): IdentityRow[] {
  const rows: IdentityRow[] = [
    ["Name", log.well.name],
    ["Id", log.well.id],
    ["Source", log.source],
    ["Depth unit", log.depthUnit],
  ];
  const md = range(log.md, log.depthUnit);
  if (md) rows.push(["MD range", md]);
  const tvdss = log.tvdss && range(log.tvdss, log.depthUnit);
  if (tvdss) rows.push(["TVDSS range", tvdss]);
  return rows;
}

export function warningSections(warnings: readonly LoadWarning[]): WarningSections {
  const cautions = warnings.filter((w) => severityOf(w.code) === "caution");
  const byCode = new Map<LoadWarningCode, LoadWarning[]>();
  for (const w of warnings) {
    if (severityOf(w.code) !== "note") continue;
    const items = byCode.get(w.code) ?? [];
    items.push(w);
    byCode.set(w.code, items);
  }
  const notes = [...byCode].map(([code, items]): NoteGroup => {
    const summarise = NOTE_SUMMARIES[code];
    const summary = summarise
      ? summarise(items.length)
      : items.length === 1
        ? items[0].message
        : `${items[0].message} (×${items.length})`;
    return { code, summary, items };
  });
  return { cautions, notes };
}

export function cautionCount(log: WellLog): number {
  return log.warnings.filter((w) => severityOf(w.code) === "caution").length;
}
