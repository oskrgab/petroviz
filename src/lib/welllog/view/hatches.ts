/**
 * The canvas hatches drawn for FGDC lithologic patterns: simple marks on a
 * 12 × 12 tile, after the KGS chart's patterns. Pure data; the canvas layer
 * draws a tile from it.
 */

import type { FgdcPattern } from "./template/types.ts";

/** A tile is HATCH_TILE × HATCH_TILE units. */
export const HATCH_TILE = 12;

export interface Hatch {
  /** Polylines as flat [x, y, x, y, …] in tile units. */
  readonly lines: readonly (readonly number[])[];
  /** Square dots, top-left corners in tile units. */
  readonly dots: readonly (readonly [number, number])[];
}

const hatch = (lines: number[][], dots: [number, number][] = []): Hatch => ({ lines, dots });

export const HATCHES: Readonly<Record<FgdcPattern, Hatch>> = {
  607: hatch([], [
    [2, 2],
    [8, 8],
  ]), // sandstone: dots
  670: hatch([[6, 8, 11, 8]], [[2, 2]]), // interbedded sandstone and shale: dots and dashes
  620: hatch([
    [1, 3, 6, 3],
    [7, 9, 12, 9],
  ]), // shale: dashes
  623: hatch([[0, 6, 3, 4, 6, 6, 9, 8, 12, 6]]), // marl: wavy lines
  642: hatch([
    [0, 0, 12, 0],
    [0, 6, 12, 6],
    [2, 0, 4, 6],
    [8, 6, 10, 12],
  ]), // dolomite: slanted brick
  627: hatch([
    [0, 0, 12, 0],
    [0, 6, 12, 6],
    [3, 0, 3, 6],
    [9, 6, 9, 12],
  ]), // limestone: brick
  626: hatch([
    [1, 3, 5, 3],
    [3, 3, 3, 5],
    [7, 9, 11, 9],
    [9, 9, 9, 11],
  ]), // chalk: open brick
  668: hatch([
    [0, 0, 12, 12],
    [12, 0, 0, 12],
  ]), // halite: crosshatch
  667: hatch([
    [2, 6, 4, 3, 6, 6],
    [8, 11, 10, 8, 12, 11],
  ]), // anhydrite (gypsum's pattern): chevrons
  711: hatch([
    [3, 2, 3, 5],
    [9, 8, 9, 11],
  ]), // tuff: short ticks
  658: hatch([]), // coal: solid
  718: hatch([
    [3, 1, 3, 5],
    [1, 3, 5, 3],
    [9, 7, 9, 11],
    [7, 9, 11, 9],
  ]), // basement: crosses
};
