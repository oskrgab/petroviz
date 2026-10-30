import { test } from "node:test";
import assert from "node:assert/strict";
import { curveFamilyOf, type Curve } from "../../core/index.ts";
import { curveFamilyDefaults, defaultTemplate } from "./defaults.ts";
import { editTemplate, endsAreValid, entryForCurve, scaleWithType, type TemplateEdit } from "./edit.ts";
import type { ResolvedScale } from "../geometry/scale.ts";
import type { CurveEntry, CurveScale, CurveTrack, Template } from "./types.ts";

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
