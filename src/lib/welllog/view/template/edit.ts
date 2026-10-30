/**
 * Template operations (#55): pure and immutable. Each takes the current
 * template and returns a new one, sharing every track and entry it doesn't
 * change, and never changes an id. The log view applies them through
 * `view.edit`, which writes the bound template.
 */

import type { Curve } from "../../core/index.ts";
import type { ResolvedScale } from "../geometry/scale.ts";
import { FALLBACK_PERCENTILES } from "../scaleEnds.ts";
import { curveFamilyDefaults, type ContinuousFamily } from "./defaults.ts";
import type {
  CurveEntry,
  CurveScale,
  CurveStyle,
  CurveTrack,
  FillBoundary,
  OffScale,
  ScaleType,
  Template,
} from "./types.ts";

/** Which curve entry an edit is to: its id, in its curve track. */
export interface EntryRef {
  readonly trackId: string;
  readonly entryId: string;
}

/** A change to one curve entry. */
export type EntryChange =
  | { readonly kind: "set-scale"; readonly scale: CurveScale }
  | { readonly kind: "set-off-scale"; readonly offScale: OffScale }
  | { readonly kind: "set-style"; readonly style: Partial<CurveStyle> }
  | { readonly kind: "remove-entry" };

export type TemplateEdit =
  | (EntryChange & EntryRef)
  | { readonly kind: "add-entry"; readonly trackId: string; readonly entry: CurveEntry };

/**
 * The template after `edit`. One naming a track or entry the template lacks
 * returns the template itself, unchanged.
 */
export function editTemplate(template: Template, edit: TemplateEdit): Template {
  const track = template.tracks.find((t): t is CurveTrack => t.id === edit.trackId && t.kind === "curve");
  if (!track) return template;
  const next = editTrack(track, edit);
  if (next === track) return template;
  return { ...template, tracks: template.tracks.map((t) => (t === track ? next : t)) };
}

function editTrack(track: CurveTrack, edit: TemplateEdit): CurveTrack {
  switch (edit.kind) {
    case "add-entry":
      return { ...track, curves: [...track.curves, edit.entry] };
    case "remove-entry": {
      if (!track.curves.some((e) => e.id === edit.entryId)) return track;
      const onRemoved = (boundary: FillBoundary) => boundary.kind === "curve" && boundary.id === edit.entryId;
      return {
        ...track,
        curves: track.curves.filter((e) => e.id !== edit.entryId),
        // A fill on a removed entry could never draw again, and would leave the template invalid.
        ...(track.fills && { fills: track.fills.filter((f) => !onRemoved(f.a) && !onRemoved(f.b)) }),
      };
    }
    case "set-scale":
      return editEntry(track, edit.entryId, (e) => ({ ...e, scale: edit.scale }));
    case "set-off-scale":
      return editEntry(track, edit.entryId, (e) => ({ ...e, offScale: edit.offScale }));
    case "set-style":
      return editEntry(track, edit.entryId, (e) => ({ ...e, style: { ...e.style, ...edit.style } }));
  }
}

function editEntry(track: CurveTrack, entryId: string, change: (entry: CurveEntry) => CurveEntry): CurveTrack {
  if (!track.curves.some((e) => e.id === entryId)) return track;
  return { ...track, curves: track.curves.map((e) => (e.id === entryId ? change(e) : e)) };
}

/** Every entry id in the template, curve and discrete. */
function entryIds(template: Template): Set<string> {
  return new Set(
    template.tracks.flatMap((track) =>
      track.kind === "curve" ? track.curves.map((e) => e.id) : track.kind === "discrete" ? [track.curve.id] : [],
    ),
  );
}

/**
 * A new entry for a curve picked by hand: `[key, mnemonic, family]`
 * selectors (ADR-0003), so on another well log it falls back on the
 * mnemonic, then the family. It takes the curve family's defaults; a family
 * with none (`unknown`, or lithology read as continuous) takes `unknown`'s
 * grey percentile scale. Its id is new to the template, so the same curve
 * can be added twice.
 */
export function entryForCurve(template: Template, curve: Curve): CurveEntry {
  const defaults = curveFamilyDefaults[curve.family as ContinuousFamily] ?? curveFamilyDefaults.unknown;
  const taken = entryIds(template);
  const base = curve.key.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "curve";
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return {
    id,
    select: [
      { by: "key", value: curve.key },
      { by: "mnemonic", value: curve.mnemonic },
      { by: "family", value: curve.family },
    ],
    scale: defaults.scale,
    offScale: defaults.offScale,
    style: defaults.style,
  };
}

/** Ends computed from the curve's 1st to 99th percentile, as fixed ends fall back on. */
export function percentileScale(type: ScaleType, reversed: boolean): CurveScale {
  return { type, ends: { kind: "percentile", ...FALLBACK_PERCENTILES, reversed } };
}

/**
 * The scale with its type changed, keeping its ends where the new type can
 * use them. Fixed ends a log scale can't place (at or below zero), and a
 * window on the median (whose width is in values on one type and decades on
 * the other), become percentile ends in the same direction.
 */
export function scaleWithType(scale: CurveScale, type: ScaleType): CurveScale {
  if (scale.type === type) return scale;
  const { ends } = scale;
  switch (ends.kind) {
    case "fixed":
      return type === "log" && Math.min(ends.left, ends.right) <= 0
        ? percentileScale(type, ends.left > ends.right)
        : { type, ends };
    case "centredOnMedian":
      return percentileScale(type, ends.reversed);
    case "percentile":
      return { type, ends };
  }
}

/** Whether typed ends make a scale: finite, apart, and above zero on a log scale. */
export function endsAreValid({ left, right, type }: ResolvedScale): boolean {
  if (!Number.isFinite(left) || !Number.isFinite(right) || left === right) return false;
  return type === "linear" || (left > 0 && right > 0);
}
