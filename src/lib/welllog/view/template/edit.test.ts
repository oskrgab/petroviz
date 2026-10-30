import { test } from "node:test";
import assert from "node:assert/strict";
import { curveFamilyOf, type Curve } from "../../core/index.ts";
import { curveFamilyDefaults, defaultTemplate, STANDARD_WIDTHS } from "./defaults.ts";
import {
  editTemplate,
  endsAreValid,
  entryForCurve,
  newCurveTrack,
  newDepthTrack,
  newDiscreteTrack,
  newFill,
  newZoneTrack,
  scaleWithType,
  type TemplateEdit,
} from "./edit.ts";
import type { ResolvedScale } from "../geometry/scale.ts";
import type {
  CurveEntry,
  CurveScale,
  CurveTrack,
  DiscreteTrack,
  Fill,
  FillBoundary,
  Template,
  Track,
} from "./types.ts";

function curve(key: string, unit = "", family = curveFamilyOf(key.replace(/:\d+$/, ""), unit)): Curve {
  return {
    key,
    mnemonic: key.replace(/:\d+$/, ""),
    unit,
    description: "",
    kind: "continuous",
    family,
    values: new Float32Array([1, 2]),
  };
}

const curveTrack = (t: Template, id: string) => t.tracks.find((track) => track.id === id) as CurveTrack;
const entryIn = (t: Template, trackId: string, entryId: string) =>
  curveTrack(t, trackId).curves.find((e) => e.id === entryId) as CurveEntry;
const ids = (t: Template) => t.tracks.map((track) => [track.id, track.kind === "curve" ? track.curves.map((e) => e.id) : []]);

/** Applies the edit and checks what every operation promises: a new template, the old one untouched. */
function edited(t: Template, edit: TemplateEdit): Template {
  const before = JSON.stringify(t);
  const after = editTemplate(t, edit);
  assert.notEqual(after, t);
  assert.equal(JSON.stringify(t), before);
  return after;
}

const LOG_SCALE: CurveScale = { type: "log", ends: { kind: "fixed", left: 1, right: 1000, unit: "ohm.m" } };

test("setting a scale replaces only that entry's scale, and keeps every id", () => {
  const t = defaultTemplate();
  const after = edited(t, { kind: "set-scale", trackId: "resistivity", entryId: "resistivity-deep", scale: LOG_SCALE });
  assert.deepEqual(entryIn(after, "resistivity", "resistivity-deep").scale, LOG_SCALE);
  assert.deepEqual(ids(after), ids(t));
  // Untouched tracks and entries are shared, not copied.
  assert.equal(after.tracks[0], t.tracks[0]);
  assert.equal(entryIn(after, "resistivity", "resistivity-medium"), entryIn(t, "resistivity", "resistivity-medium"));
});

test("setting the off-scale mode", () => {
  const t = defaultTemplate();
  const after = edited(t, { kind: "set-off-scale", trackId: "gr-caliper", entryId: "gamma-ray", offScale: "clip" });
  assert.equal(entryIn(after, "gr-caliper", "gamma-ray").offScale, "clip");
  assert.equal(entryIn(t, "gr-caliper", "gamma-ray").offScale, "wrap");
  assert.deepEqual(ids(after), ids(t));
});

test("setting the style changes only the parts given", () => {
  const t = defaultTemplate();
  const a = edited(t, { kind: "set-style", trackId: "gr-caliper", entryId: "gamma-ray", style: { colour: "#123456" } });
  assert.deepEqual(entryIn(a, "gr-caliper", "gamma-ray").style, { colour: "#123456", width: 1, dash: "solid" });
  const b = edited(a, { kind: "set-style", trackId: "gr-caliper", entryId: "gamma-ray", style: { width: 2, dash: "dotted" } });
  assert.deepEqual(entryIn(b, "gr-caliper", "gamma-ray").style, { colour: "#123456", width: 2, dash: "dotted" });
  assert.deepEqual(ids(b), ids(t));
});

test("adding an entry appends it to its track", () => {
  const t = defaultTemplate();
  const entry = entryForCurve(t, curve("GR:2", "gAPI"));
  const after = edited(t, { kind: "add-entry", trackId: "sonic", entry });
  assert.deepEqual(
    curveTrack(after, "sonic").curves.map((e) => e.id),
    [...curveTrack(t, "sonic").curves.map((e) => e.id), entry.id],
  );
  // Every other track, and every id already there, stays as it was.
  assert.deepEqual(ids(after).filter(([id]) => id !== "sonic"), ids(t).filter(([id]) => id !== "sonic"));
});

test("removing an entry also removes the fills that name it, and keeps the rest", () => {
  const t = defaultTemplate();
  const after = edited(t, { kind: "remove-entry", trackId: "gr-caliper", entryId: "gamma-ray" });
  const track = curveTrack(after, "gr-caliper");
  assert.ok(!track.curves.some((e) => e.id === "gamma-ray"));
  assert.deepEqual(track.fills?.map((f) => f.id), ["caliper-bit-size"]);

  const both = edited(after, { kind: "remove-entry", trackId: "gr-caliper", entryId: "bit-size" });
  assert.deepEqual(curveTrack(both, "gr-caliper").fills, []);
  assert.deepEqual(
    curveTrack(both, "gr-caliper").curves.map((e) => e.id),
    ["spectral-gamma-ray", "sp", "caliper"],
  );
});

test("removing an entry from a track without fills adds none", () => {
  const t = defaultTemplate();
  const after = edited(t, { kind: "remove-entry", trackId: "sonic", entryId: "sonic-shear" });
  assert.ok(!("fills" in curveTrack(after, "sonic")));
});

test("an edit naming a track or entry the template lacks changes nothing", () => {
  const t = defaultTemplate();
  const edits: TemplateEdit[] = [
    { kind: "set-off-scale", trackId: "gr-caliper", entryId: "nope", offScale: "clip" },
    { kind: "set-off-scale", trackId: "nope", entryId: "gamma-ray", offScale: "clip" },
    { kind: "remove-entry", trackId: "sonic", entryId: "gamma-ray" },
    { kind: "add-entry", trackId: "depth", entry: entryForCurve(t, curve("GR", "gAPI")) },
  ];
  for (const edit of edits) assert.equal(editTemplate(t, edit), t);
});

test("a curve picked by hand selects by key, mnemonic and family, with its family's defaults", () => {
  const t = defaultTemplate();
  const entry = entryForCurve(t, curve("RDEP:2", "ohm.m"));
  assert.deepEqual(entry.select, [
    { by: "key", value: "RDEP:2" },
    { by: "mnemonic", value: "RDEP" },
    { by: "family", value: "resistivity-deep" },
  ]);
  const defaults = curveFamilyDefaults["resistivity-deep"];
  assert.deepEqual([entry.scale, entry.offScale, entry.style], [defaults.scale, defaults.offScale, defaults.style]);
});

test("an unknown curve gets the grey percentile default, as does a lithology curve read as continuous", () => {
  const t = defaultTemplate();
  for (const picked of [curve("XYZ", "", "unknown"), curve("LITH", "", "lithology")]) {
    const entry = entryForCurve(t, picked);
    assert.deepEqual(entry.scale, { type: "linear", ends: { kind: "percentile", lo: 1, hi: 99, reversed: false } });
    assert.equal(entry.style.colour, "#808080");
  }
});

test("a picked curve's entry id is new to the template, so the same curve can be added twice", () => {
  let t = defaultTemplate();
  const gr = curve("GR", "gAPI");
  const first = entryForCurve(t, gr);
  t = editTemplate(t, { kind: "add-entry", trackId: "sonic", entry: first });
  const second = entryForCurve(t, gr);
  t = editTemplate(t, { kind: "add-entry", trackId: "sonic", entry: second });
  assert.notEqual(first.id, second.id);
  const all = t.tracks.flatMap((track) =>
    track.kind === "curve" ? track.curves.map((e) => e.id) : track.kind === "discrete" ? [track.curve.id] : [],
  );
  assert.equal(new Set(all).size, all.length);
  assert.deepEqual(first.select, second.select);
});

test("an entry id never takes the id of the default template's entries", () => {
  const t = defaultTemplate();
  // "rxo" and "lithology" are already entry ids in the default template.
  assert.notEqual(entryForCurve(t, curve("RXO", "ohm.m")).id, "rxo");
  assert.notEqual(entryForCurve(t, curve("LITHOLOGY", "", "lithology")).id, "lithology");
});

const fixedScale = (left: number, right: number, type: CurveScale["type"] = "linear"): CurveScale => ({
  type,
  ends: { kind: "fixed", left, right, unit: "u" },
});

test("switching to log keeps fixed ends that a log scale can place", () => {
  assert.deepEqual(scaleWithType(fixedScale(0.2, 2000), "log"), fixedScale(0.2, 2000, "log"));
  assert.deepEqual(scaleWithType(fixedScale(2000, 0.2, "log"), "linear"), fixedScale(2000, 0.2));
});

test("switching to log with an end at or below zero computes the ends from the data, in the same direction", () => {
  assert.deepEqual(scaleWithType(fixedScale(0, 150), "log"), {
    type: "log",
    ends: { kind: "percentile", lo: 1, hi: 99, reversed: false },
  });
  assert.deepEqual(scaleWithType(fixedScale(0.45, -0.15), "log"), {
    type: "log",
    ends: { kind: "percentile", lo: 1, hi: 99, reversed: true },
  });
});

test("switching type keeps percentile ends, and turns a window on the median into percentile ends", () => {
  const percentile: CurveScale = { type: "linear", ends: { kind: "percentile", lo: 5, hi: 95, reversed: true } };
  assert.deepEqual(scaleWithType(percentile, "log"), { ...percentile, type: "log" });
  const sp: CurveScale = { type: "linear", ends: { kind: "centredOnMedian", width: 100, reversed: false } };
  assert.deepEqual(scaleWithType(sp, "log"), {
    type: "log",
    ends: { kind: "percentile", lo: 1, hi: 99, reversed: false },
  });
  assert.equal(scaleWithType(sp, "linear"), sp);
});

test("ends are valid when finite and apart, and above zero on a log scale", () => {
  const cases: [ResolvedScale, boolean][] = [
    [{ left: 0, right: 150, type: "linear" }, true],
    [{ left: 150, right: 0, type: "linear" }, true],
    [{ left: -0.15, right: 0.45, type: "linear" }, true],
    [{ left: 5, right: 5, type: "linear" }, false],
    [{ left: NaN, right: 5, type: "linear" }, false],
    [{ left: 0, right: Infinity, type: "linear" }, false],
    [{ left: 0.2, right: 2000, type: "log" }, true],
    [{ left: 0, right: 2000, type: "log" }, false],
    [{ left: 2000, right: -1, type: "log" }, false],
  ];
  for (const [scale, valid] of cases) assert.equal(endsAreValid(scale), valid, JSON.stringify(scale));
});

// Track operations (#56).

const trackIds = (t: Template) => t.tracks.map((track) => track.id);

test("moving a track puts it at its new index and keeps every track as it was", () => {
  const t = defaultTemplate();
  const after = edited(t, { kind: "move-track", trackId: "depth", to: 0 });
  assert.deepEqual(trackIds(after).slice(0, 3), ["depth", "gr-caliper", "resistivity"]);
  for (const track of after.tracks) assert.equal(track, t.tracks.find((u) => u.id === track.id));

  const toEnd = edited(t, { kind: "move-track", trackId: "gr-caliper", to: t.tracks.length - 1 });
  assert.deepEqual(trackIds(toEnd).at(-1), "gr-caliper");
  assert.deepEqual(trackIds(toEnd).slice(0, 2), ["depth", "resistivity"]);
  assert.deepEqual([...trackIds(toEnd)].sort(), [...trackIds(t)].sort());
});

test("moving a track past either end stops there, and moving it to where it is changes nothing", () => {
  const t = defaultTemplate();
  assert.deepEqual(trackIds(edited(t, { kind: "move-track", trackId: "sonic", to: -3 }))[0], "sonic");
  assert.deepEqual(trackIds(edited(t, { kind: "move-track", trackId: "sonic", to: 99 })).at(-1), "sonic");
  assert.equal(editTemplate(t, { kind: "move-track", trackId: "sonic", to: trackIds(t).indexOf("sonic") }), t);
});

test("setting a track's width changes only that track", () => {
  const t = defaultTemplate();
  const after = edited(t, { kind: "set-track-width", trackId: "sonic", width: 1.6 });
  assert.equal(after.tracks.find((track) => track.id === "sonic")?.width, 1.6);
  for (const track of after.tracks) if (track.id !== "sonic") assert.equal(track, t.tracks.find((u) => u.id === track.id));
  assert.deepEqual(trackIds(after), trackIds(t));
});

test("a width that isn't a positive number, or is the same, changes nothing", () => {
  const t = defaultTemplate();
  for (const width of [0, -1, NaN, Infinity, 1]) {
    assert.equal(editTemplate(t, { kind: "set-track-width", trackId: "sonic", width }), t, String(width));
  }
});

test("resetting a width returns it to the default template's, else to the kind's standard width", () => {
  let t = defaultTemplate();
  t = editTemplate(t, { kind: "set-track-width", trackId: "drilling", width: 2 });
  t = editTemplate(t, { kind: "set-track-width", trackId: "depth", width: 2 });
  t = editTemplate(t, { kind: "add-track", track: { ...newZoneTrack(t, "GROUP"), width: 3 } });
  const added = t.tracks.at(-1)!.id;
  for (const [trackId, width] of [["drilling", 0.75], ["depth", 0.5], [added, STANDARD_WIDTHS.zone]] as const) {
    const after = edited(t, { kind: "reset-track-width", trackId });
    assert.equal(after.tracks.find((track) => track.id === trackId)?.width, width, trackId);
  }
  // A width already at its default changes nothing.
  const d = defaultTemplate();
  assert.equal(editTemplate(d, { kind: "reset-track-width", trackId: "sonic" }), d);
});

test("removing a track takes its entries and fills with it, and leaves the others", () => {
  const t = defaultTemplate();
  const after = edited(t, { kind: "remove-track", trackId: "gr-caliper" });
  assert.deepEqual(trackIds(after), trackIds(t).filter((id) => id !== "gr-caliper"));
  for (const track of after.tracks) assert.equal(track, t.tracks.find((u) => u.id === track.id));
});

test("adding a track appends it, or puts it at the index given", () => {
  const t = defaultTemplate();
  const curveTrackAdded = edited(t, { kind: "add-track", track: newCurveTrack(t) });
  assert.equal(curveTrackAdded.tracks.length, t.tracks.length + 1);
  assert.deepEqual(curveTrackAdded.tracks.at(-1), { id: "curve", kind: "curve", width: 1, curves: [] });

  const depth = newDepthTrack(t, "tvdss");
  const atTwo = edited(t, { kind: "add-track", track: depth, at: 2 });
  assert.equal(atTwo.tracks[2], depth);
  assert.deepEqual(trackIds(atTwo).filter((id) => id !== depth.id), trackIds(t));
});

test("a track whose id the template already has is not added", () => {
  const t = defaultTemplate();
  assert.equal(editTemplate(t, { kind: "add-track", track: { ...newCurveTrack(t), id: "sonic" } }), t);
});

test("new tracks of every kind, with ids new to the template", () => {
  let t = defaultTemplate();
  const add = (track: Track) => (t = editTemplate(t, { kind: "add-track", track }));
  add(newDepthTrack(t, "active"));
  add(newDepthTrack(t, "md"));
  add(newDepthTrack(t, "tvdss"));
  add(newCurveTrack(t));
  add(newCurveTrack(t));
  add(newZoneTrack(t, "FORMATION"));
  const lith: Curve = { ...curve("LITH", ""), kind: "discrete", family: "lithology" };
  add(newDiscreteTrack(t, lith));
  add(newDiscreteTrack(t, null));

  const added = t.tracks.slice(9);
  assert.deepEqual(
    added.map((track) => [track.id, track.kind, track.width]),
    [
      ["depth-2", "depth", 0.5],
      ["depth-md", "depth", 0.5],
      ["depth-tvdss", "depth", 0.5],
      ["curve", "curve", 1],
      ["curve-2", "curve", 1],
      ["formation-2", "zone", 0.6],
      ["lith", "discrete", 0.4],
      ["lithology-2", "discrete", 0.4],
    ],
  );
  assert.deepEqual(
    added.map((track) => (track.kind === "depth" ? track.ref : track.kind === "zone" ? track.zoneSet : null)).slice(0, 6),
    ["active", "md", "tvdss", null, null, "FORMATION"],
  );
  assert.equal(new Set(trackIds(t)).size, t.tracks.length);

  // A discrete track picked from a curve selects it as a curve picked by hand does; without one, by family.
  const [byCurve, byFamily] = added.slice(6) as DiscreteTrack[];
  assert.deepEqual(byCurve.curve.select, [
    { by: "key", value: "LITH" },
    { by: "mnemonic", value: "LITH" },
    { by: "family", value: "lithology" },
  ]);
  assert.deepEqual(byFamily.curve.select, [{ by: "family", value: "lithology" }]);
  // Their entry ids are new among every entry id, as fills and entries need.
  assert.notEqual(byFamily.curve.id, "lithology");
});

// Fill operations (#56).

const fillsOf = (t: Template, trackId: string) => curveTrack(t, trackId).fills ?? [];

test("adding a fill between two curves, a curve and a value, and a curve and an edge", () => {
  let t = defaultTemplate();
  const boundaries: [FillBoundary, FillBoundary][] = [
    [{ kind: "curve", id: "resistivity-deep" }, { kind: "curve", id: "resistivity-shallow" }],
    [{ kind: "curve", id: "resistivity-deep" }, { kind: "value", value: 20 }],
    [{ kind: "edge", edge: "left" }, { kind: "curve", id: "resistivity-medium" }],
  ];
  for (const [a, b] of boundaries) {
    const fill = newFill(t, a, b);
    t = edited(t, { kind: "add-fill", trackId: "resistivity", fill });
    assert.deepEqual(fillsOf(t, "resistivity").at(-1), fill);
  }
  assert.deepEqual(
    fillsOf(t, "resistivity").map((f) => f.id),
    ["fill", "fill-2", "fill-3"],
  );
  // The track had no fills; every other track is shared.
  assert.ok(!("fills" in curveTrack(defaultTemplate(), "resistivity")));
  assert.equal(t.tracks[0].kind, "curve");
});

test("a new fill takes two colours with alpha, yellow where a is left and grey where it is right", () => {
  const fill = newFill(defaultTemplate(), { kind: "curve", id: "gamma-ray" }, { kind: "edge", edge: "right" });
  assert.match(fill.colourWhereALeft, /^#[0-9A-F]{8}$/);
  assert.match(fill.colourWhereARight, /^#[0-9A-F]{8}$/);
  assert.notEqual(fill.colourWhereALeft, fill.colourWhereARight);
  // The default template already has fills, and a new one's id is new.
  assert.equal(fill.id, "fill");
});

test("a fill that couldn't draw is not added", () => {
  const t = defaultTemplate();
  const fill = (a: FillBoundary, b: FillBoundary) => ({ ...newFill(t, a, b) });
  const invalid: [string, Fill][] = [
    // An entry from another track.
    ["sonic", fill({ kind: "curve", id: "gamma-ray" }, { kind: "edge", edge: "left" })],
    // No entry by that id at all.
    ["sonic", fill({ kind: "curve", id: "nope" }, { kind: "edge", edge: "left" })],
    // Neither boundary is a curve.
    ["sonic", fill({ kind: "edge", edge: "left" }, { kind: "edge", edge: "right" })],
    // A value needs the other boundary to be a curve.
    ["sonic", fill({ kind: "value", value: 80 }, { kind: "edge", edge: "right" })],
    ["sonic", fill({ kind: "value", value: NaN }, { kind: "curve", id: "sonic-compressional" })],
    // Not a curve track.
    ["depth", fill({ kind: "edge", edge: "left" }, { kind: "edge", edge: "right" })],
    // An id the template already has.
    ["sonic", { ...fill({ kind: "curve", id: "sonic-shear" }, { kind: "edge", edge: "left" }), id: "gr-sand" }],
  ];
  for (const [trackId, f] of invalid) assert.equal(editTemplate(t, { kind: "add-fill", trackId, fill: f }), t, JSON.stringify(f));
});

test("editing a fill changes its boundaries and colours, and keeps its id and place", () => {
  const t = defaultTemplate();
  const after = edited(t, {
    kind: "set-fill",
    trackId: "gr-caliper",
    fillId: "gr-sand",
    change: { b: { kind: "value", value: 75 }, colourWhereALeft: "#FFD70080" },
  });
  const [before, edits] = [fillsOf(t, "gr-caliper"), fillsOf(after, "gr-caliper")];
  assert.deepEqual(edits.map((f) => f.id), before.map((f) => f.id));
  assert.deepEqual(edits[0], { ...before[0], b: { kind: "value", value: 75 }, colourWhereALeft: "#FFD70080" });
  assert.equal(edits[1], before[1]);
  assert.equal(curveTrack(after, "gr-caliper").curves, curveTrack(t, "gr-caliper").curves);
});

test("an edit that would leave a fill unable to draw, or names no fill, changes nothing", () => {
  const t = defaultTemplate();
  const edits: TemplateEdit[] = [
    { kind: "set-fill", trackId: "gr-caliper", fillId: "gr-sand", change: { a: { kind: "edge", edge: "left" } } },
    { kind: "set-fill", trackId: "gr-caliper", fillId: "gr-sand", change: { a: { kind: "curve", id: "sonic-shear" } } },
    { kind: "set-fill", trackId: "gr-caliper", fillId: "nope", change: { colourWhereALeft: "#00000000" } },
    { kind: "set-fill", trackId: "sonic", fillId: "gr-sand", change: { colourWhereALeft: "#00000000" } },
    { kind: "set-fill", trackId: "gr-caliper", fillId: "gr-sand", change: { colourWhereALeft: "#FFFF0066" } },
    { kind: "remove-fill", trackId: "gr-caliper", fillId: "nope" },
    { kind: "remove-fill", trackId: "sonic", fillId: "gr-sand" },
  ];
  for (const edit of edits) assert.equal(editTemplate(t, edit), t, JSON.stringify(edit));
});

test("removing a fill leaves the track's curves and other fills", () => {
  const t = defaultTemplate();
  const after = edited(t, { kind: "remove-fill", trackId: "gr-caliper", fillId: "gr-shale" });
  assert.deepEqual(fillsOf(after, "gr-caliper").map((f) => f.id), ["gr-sand", "caliper-bit-size"]);
  assert.equal(curveTrack(after, "gr-caliper").curves, curveTrack(t, "gr-caliper").curves);
});
