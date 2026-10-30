/**
 * Template operations (#55, #56): pure and immutable. Each takes the current
 * template and returns a new one, sharing every track and entry it doesn't
 * change, and never changes an id. The log view applies them through
 * `view.edit`, which writes the bound template.
 *
 * An edit the template can't take (naming a track, entry or fill it lacks,
 * or leaving a fill unable to draw) returns the template itself, unchanged,
 * as does one that would change nothing.
 */

import type { Curve } from "../../core/index.ts";
import type { ResolvedScale } from "../geometry/scale.ts";
import { FALLBACK_PERCENTILES } from "../scaleEnds.ts";
import { curveFamilyDefaults, defaultTemplate, FILL_ALPHA, STANDARD_WIDTHS, type ContinuousFamily } from "./defaults.ts";
import type {
  CurveEntry,
  CurveScale,
  CurveStyle,
  CurveTrack,
  DepthTrack,
  DepthTrackRef,
  DiscreteTrack,
  Fill,
  FillBoundary,
  OffScale,
  ScaleType,
  Selector,
  Template,
  Track,
  ZoneTrack,
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

/** A change to a track's place or width, or a track added or removed. */
export type TrackEdit =
  /** `to` is the track's index once moved, held within the template. */
  | { readonly kind: "move-track"; readonly trackId: string; readonly to: number }
  | { readonly kind: "set-track-width"; readonly trackId: string; readonly width: number }
  /** Back to the default template's width for the track, else its kind's standard width. */
  | { readonly kind: "reset-track-width"; readonly trackId: string }
  | { readonly kind: "remove-track"; readonly trackId: string }
  /** At the end, or at index `at`. */
  | { readonly kind: "add-track"; readonly track: Track; readonly at?: number };

/** A fill's boundaries and colours; its id never changes. */
export type FillChange = Partial<Omit<Fill, "id">>;

/** A change to a curve track's fills. */
export type FillEdit =
  | { readonly kind: "add-fill"; readonly trackId: string; readonly fill: Fill }
  | { readonly kind: "set-fill"; readonly trackId: string; readonly fillId: string; readonly change: FillChange }
  | { readonly kind: "remove-fill"; readonly trackId: string; readonly fillId: string };

export type TemplateEdit =
  | (EntryChange & EntryRef)
  | { readonly kind: "add-entry"; readonly trackId: string; readonly entry: CurveEntry }
  | TrackEdit
  | FillEdit;

/** Edits made within one curve track. */
type CurveTrackEdit = Exclude<TemplateEdit, TrackEdit>;

/** The template after `edit`, or the template itself when it can't take it. */
export function editTemplate(template: Template, edit: TemplateEdit): Template {
  switch (edit.kind) {
    case "move-track":
      return moveTrack(template, edit.trackId, edit.to);
    case "set-track-width":
      return setWidth(template, edit.trackId, edit.width);
    case "reset-track-width": {
      const track = template.tracks.find((t) => t.id === edit.trackId);
      return track ? setWidth(template, track.id, defaultWidth(track)) : template;
    }
    case "remove-track":
      if (!template.tracks.some((t) => t.id === edit.trackId)) return template;
      return { ...template, tracks: template.tracks.filter((t) => t.id !== edit.trackId) };
    case "add-track": {
      if (template.tracks.some((t) => t.id === edit.track.id)) return template;
      const tracks = [...template.tracks];
      tracks.splice(edit.at ?? tracks.length, 0, edit.track);
      return { ...template, tracks };
    }
    default: {
      const track = template.tracks.find((t): t is CurveTrack => t.id === edit.trackId && t.kind === "curve");
      if (!track) return template;
      return replaceTrack(template, track, editCurveTrack(template, track, edit));
    }
  }
}

function replaceTrack(template: Template, track: Track, next: Track): Template {
  if (next === track) return template;
  return { ...template, tracks: template.tracks.map((t) => (t === track ? next : t)) };
}

function moveTrack(template: Template, trackId: string, to: number): Template {
  const from = template.tracks.findIndex((t) => t.id === trackId);
  const index = Math.min(Math.max(Math.round(to), 0), template.tracks.length - 1);
  if (from < 0 || index === from) return template;
  const tracks = template.tracks.filter((_, i) => i !== from);
  tracks.splice(index, 0, template.tracks[from]);
  return { ...template, tracks };
}

function setWidth(template: Template, trackId: string, width: number): Template {
  const track = template.tracks.find((t) => t.id === trackId);
  if (!track || !(width > 0 && Number.isFinite(width)) || width === track.width) return template;
  return replaceTrack(template, track, { ...track, width });
}

/** The default template's width for a track it has (same id and kind), else the kind's standard width. */
function defaultWidth(track: Track): number {
  const builtIn = defaultTemplate().tracks.find((t) => t.id === track.id && t.kind === track.kind);
  return builtIn?.width ?? STANDARD_WIDTHS[track.kind];
}

function editCurveTrack(template: Template, track: CurveTrack, edit: CurveTrackEdit): CurveTrack {
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
    case "add-fill":
      if (fillIds(template).has(edit.fill.id) || !fillCanDraw(track, edit.fill)) return track;
      return { ...track, fills: [...(track.fills ?? []), edit.fill] };
    case "set-fill": {
      const fill = track.fills?.find((f) => f.id === edit.fillId);
      if (!fill) return track;
      const next: Fill = { ...fill, ...edit.change, id: fill.id };
      if (JSON.stringify(next) === JSON.stringify(fill) || !fillCanDraw(track, next)) return track;
      return { ...track, fills: track.fills!.map((f) => (f === fill ? next : f)) };
    }
    case "remove-fill":
      if (!track.fills?.some((f) => f.id === edit.fillId)) return track;
      return { ...track, fills: track.fills.filter((f) => f.id !== edit.fillId) };
  }
}

function editEntry(track: CurveTrack, entryId: string, change: (entry: CurveEntry) => CurveEntry): CurveTrack {
  if (!track.curves.some((e) => e.id === entryId)) return track;
  return { ...track, curves: track.curves.map((e) => (e.id === entryId ? change(e) : e)) };
}

/**
 * Whether a fill can draw in its track whatever the well log: each curve
 * boundary names one of the track's entries, a value is a number with a
 * curve on the other side, and at least one boundary is a curve (#28).
 */
export function fillCanDraw(track: CurveTrack, { a, b }: Pick<Fill, "a" | "b">): boolean {
  const valid = (boundary: FillBoundary, other: FillBoundary) => {
    switch (boundary.kind) {
      case "curve":
        return track.curves.some((e) => e.id === boundary.id);
      case "value":
        return Number.isFinite(boundary.value) && other.kind === "curve";
      case "edge":
        return true;
    }
  };
  return valid(a, b) && valid(b, a) && (a.kind === "curve" || b.kind === "curve");
}

/** `base`, else `base-2`, `base-3`…: the first not in `taken`. */
function uniqueId(base: string, taken: ReadonlySet<string>): string {
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

/** An id made from a name: lowercased, with anything not alphanumeric as "-". */
const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-");

const trackIds = (template: Template) => new Set(template.tracks.map((t) => t.id));

const fillIds = (template: Template) =>
  new Set(template.tracks.flatMap((t) => (t.kind === "curve" ? (t.fills ?? []).map((f) => f.id) : [])));

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
  return {
    id: uniqueId(slug(curve.key) || "curve", entryIds(template)),
    select: pickedByHand(curve),
    scale: defaults.scale,
    offScale: defaults.offScale,
    style: defaults.style,
  };
}

/** A curve picked by hand selects by key, then mnemonic, then family (ADR-0003). */
const pickedByHand = (curve: Curve): Selector[] => [
  { by: "key", value: curve.key },
  { by: "mnemonic", value: curve.mnemonic },
  { by: "family", value: curve.family },
];

/** A new curve track, with no curves yet; its header says so, and its ＋ adds them. */
export function newCurveTrack(template: Template): CurveTrack {
  return { id: uniqueId("curve", trackIds(template)), kind: "curve", width: STANDARD_WIDTHS.curve, curves: [] };
}

/** A new depth track, showing the active depth reference or a fixed one. */
export function newDepthTrack(template: Template, ref: DepthTrackRef): DepthTrack {
  const base = ref === "active" ? "depth" : `depth-${ref}`;
  return { id: uniqueId(base, trackIds(template)), kind: "depth", width: STANDARD_WIDTHS.depth, ref };
}

/**
 * A new discrete track for a discrete curve, picked by hand; with none, it
 * looks for the lithology family.
 */
export function newDiscreteTrack(template: Template, curve: Curve | null): DiscreteTrack {
  const base = curve ? slug(curve.key) || "discrete" : "lithology";
  return {
    id: uniqueId(base, trackIds(template)),
    kind: "discrete",
    width: STANDARD_WIDTHS.discrete,
    curve: {
      id: uniqueId(base, entryIds(template)),
      select: curve ? pickedByHand(curve) : [{ by: "family", value: "lithology" }],
    },
  };
}

/** A new zone track for one zone set, by its name. */
export function newZoneTrack(template: Template, zoneSet: string): ZoneTrack {
  return { id: uniqueId(slug(zoneSet) || "zone", trackIds(template)), kind: "zone", width: STANDARD_WIDTHS.zone, zoneSet };
}

/**
 * A new fill between two boundaries, yellow where `a` lies left of `b` and
 * grey where it lies right, both at the default fills' alpha. Its id is new
 * to the template.
 */
export function newFill(template: Template, a: FillBoundary, b: FillBoundary): Fill {
  return {
    id: uniqueId("fill", fillIds(template)),
    a,
    b,
    colourWhereALeft: `#FFFF00${FILL_ALPHA}`,
    colourWhereARight: `#BEBEBE${FILL_ALPHA}`,
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
