/**
 * The well picker's pure rules: the order the FORCE 2020 wells are listed
 * in, their quadrant groups, and the search. Kept apart from the component
 * so they run under node --test.
 */

import type { ForceWell } from "../../lib/sources/force2020/wellId.ts";

/** One well the picker can open: its file stem and display name. */
export type WellEntry = ForceWell;

/** The well list as the picker shows it; the host loads it. */
export type WellList =
  | { readonly kind: "loading" }
  | { readonly kind: "error" }
  | { readonly kind: "ready"; readonly wells: readonly WellEntry[] };

export interface QuadrantGroup {
  /** The quadrant number as written, or null for stems that don't name one. */
  readonly quadrant: string | null;
  readonly wells: readonly WellEntry[];
}

/** A Norwegian well stem: quadrant, block, well number and an optional suffix. */
const STEM = /^(\d+)-(\d+)-(\d+)(?:_(.+))?$/;

interface SortKey {
  readonly numbers: readonly [number, number, number];
  readonly suffix: string;
}

function sortKey(id: string): SortKey | null {
  const match = STEM.exec(id);
  return match ? { numbers: [Number(match[1]), Number(match[2]), Number(match[3])], suffix: match[4] ?? "" } : null;
}

function compareKeys(a: SortKey, b: SortKey): number {
  for (let i = 0; i < 3; i++) {
    if (a.numbers[i] !== b.numbers[i]) return a.numbers[i] - b.numbers[i];
  }
  return a.suffix < b.suffix ? -1 : a.suffix > b.suffix ? 1 : 0;
}

/**
 * Wells by quadrant, block and well number, compared as numbers (2 before
 * 10), then by suffix with the bare well first. Stems that don't follow
 * that form go last, by name.
 */
export function sortWells(wells: readonly WellEntry[]): WellEntry[] {
  const keyed = wells.map((well) => ({ well, key: sortKey(well.id) }));
  keyed.sort((a, b) => {
    if (a.key && b.key) return compareKeys(a.key, b.key);
    if (a.key) return -1;
    if (b.key) return 1;
    return a.well.name.localeCompare(b.well.name);
  });
  return keyed.map(({ well }) => well);
}

/** Consecutive wells of one quadrant under one heading, keeping their order. */
export function groupByQuadrant(wells: readonly WellEntry[]): QuadrantGroup[] {
  const groups: { quadrant: string | null; wells: WellEntry[] }[] = [];
  for (const well of wells) {
    const quadrant = STEM.exec(well.id)?.[1] ?? null;
    const last = groups.at(-1);
    if (last && last.quadrant === quadrant) last.wells.push(well);
    else groups.push({ quadrant, wells: [well] });
  }
  return groups;
}

/** Letters and digits only, lower-cased, so punctuation and spacing never matter. */
function searchable(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * The wells whose name contains the query, ignoring punctuation, spaces
 * and case: `34 10 16` and `3410-16` both find 34/10-16 R. A query with
 * nothing to match on keeps every well.
 */
export function filterWells(wells: readonly WellEntry[], query: string): WellEntry[] {
  const needle = searchable(query);
  if (needle === "") return [...wells];
  return wells.filter((well) => searchable(well.name).includes(needle));
}

/**
 * Whether the well list, once read, lacks `id`: such a well is unknown
 * without asking the Data host. While the list loads or failed, nothing is.
 */
export function isUnlisted(list: WellList, id: string): boolean {
  return list.kind === "ready" && !list.wells.some((well) => well.id === id);
}
