/**
 * The well log contract (ADR-0002): a plain, immutable data object, columnar
 * on one strictly increasing MD index. Every curve and depth reference has
 * one entry per row, and NaN is the only way to say "no value".
 *
 * This type is the seam between log adapters and the log view. Each adapter
 * produces one; the log view reads nothing else.
 */

import type { CurveFamily } from "./families.ts";
import type { LoadWarning } from "./warnings.ts";

export type DepthUnit = "m" | "ft";

export type CurveKind = "continuous" | "discrete";

export interface Curve {
  /** Unique within the well log: the mnemonic, with `:2`, `:3` on duplicates. */
  readonly key: string;
  /** As the source wrote it, case preserved. */
  readonly mnemonic: string;
  /** The raw source unit string, never converted. */
  readonly unit: string;
  readonly description: string;
  readonly kind: CurveKind;
  readonly family: CurveFamily;
  /** One value per row; NaN where missing. Discrete curves hold integer codes. */
  readonly values: Float32Array;
  /** Discrete curves only: code (as a string) → label. */
  readonly codes?: Readonly<Record<string, string>>;
}

/** A named MD interval. `base` is the MD of the first row after its run. */
export interface Zone {
  readonly name: string;
  readonly top: number;
  readonly base: number;
}

/** The zones from one source column, sorted and not overlapping. */
export interface ZoneSet {
  readonly name: string;
  readonly zones: readonly Zone[];
}

export interface HeaderItem {
  readonly mnemonic: string;
  readonly unit: string;
  readonly value: string;
  readonly description: string;
}

export interface WellLog {
  readonly well: { readonly id: string; readonly name: string };
  /** Where the well log came from, for display only. */
  readonly source: string;
  /** The one unit of MD, TVDSS and zone bounds. */
  readonly depthUnit: DepthUnit;
  /** Required, strictly increasing. */
  readonly md: Float64Array;
  /** Positive down, NaN where unknown, strictly increasing over its non-NaN rows. */
  readonly tvdss?: Float64Array;
  readonly curves: readonly Curve[];
  readonly zoneSets: readonly ZoneSet[];
  /** Source header items, in file order. */
  readonly header: readonly HeaderItem[];
  readonly warnings: readonly LoadWarning[];
}
