import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultTemplate } from "./defaults.ts";
import { readTemplate, TEMPLATE_FORMAT, TEMPLATE_VERSION, templateFileName, writeTemplate, type Upgrade } from "./file.ts";
import type { Template } from "./types.ts";

/** One of everything a template can hold, optional fields included. */
const everything: Template = {
  name: "Everything",
  description: "Every kind, every scale and every boundary",
  tracks: [
    {
      id: "gr",
      kind: "curve",
      width: 1.25,
      curves: [
        {
          id: "gr",
          select: [
            { by: "key", value: "GR:2" },
            { by: "mnemonic", value: "GR" },
            { by: "family", value: "gamma-ray" },
          ],
          scale: { type: "linear", ends: { kind: "fixed", left: 0, right: 150, unit: "gAPI" } },
          offScale: "wrap",
          style: { colour: "#006400", width: 1.5, dash: "dashdot" },
        },
        {
          id: "sp",
          select: [{ by: "family", value: "sp" }],
          scale: { type: "linear", ends: { kind: "centredOnMedian", width: 100, reversed: true } },
          offScale: "clip",
          style: { colour: "#0000ff", width: 1, dash: "solid" },
        },
        {
          id: "res",
          select: [],
          scale: { type: "log", ends: { kind: "percentile", lo: 1, hi: 99, reversed: false } },
          offScale: "clip",
          style: { colour: "#330000", width: 0.5, dash: "dotted" },
        },
      ],
      fills: [
        { id: "sand", a: { kind: "curve", id: "gr" }, b: { kind: "value", value: 75 }, colourWhereALeft: "#FFFF0066", colourWhereARight: "#00000000" },
        { id: "edge", a: { kind: "edge", edge: "left" }, b: { kind: "curve", id: "sp" }, colourWhereALeft: "#BEBEBE66", colourWhereARight: "#00000000" },
      ],
    },
    { id: "depth", kind: "depth", width: 0.5, ref: "active" },
    { id: "depth-tvdss", kind: "depth", width: 0.5, ref: "tvdss" },
    {
      id: "lithology",
      kind: "discrete",
      width: 0.4,
      curve: {
        id: "lithology",
        select: [{ by: "family", value: "lithology" }],
        codes: { "30000": { colour: "#FFFF00", pattern: 607 }, "90000": { colour: "#000000" } },
      },
    },
    { id: "group", kind: "zone", width: 0.6, zoneSet: "GROUP", colours: { "Viking Gp.": "#AA5500" } },
    { id: "formation", kind: "zone", width: 0.6, zoneSet: "FORMATION" },
  ],
};

/** The file `template` writes to, as an object to change before reading. */
const fileOf = (template: Template) => JSON.parse(writeTemplate(template)) as Record<string, any>;

function problemsOf(file: unknown): readonly string[] {
  const read = readTemplate(typeof file === "string" ? file : JSON.stringify(file));
  assert.equal(read.ok, false, "the file should be rejected");
  return read.ok ? [] : read.problems;
}

function templateOf(file: unknown, ...rest: Parameters<typeof readTemplate> extends [unknown, ...infer R] ? R : never): Template {
  const read = readTemplate(typeof file === "string" ? file : JSON.stringify(file), ...rest);
  assert.deepEqual(read.ok ? [] : read.problems, []);
  return read.ok ? read.template : (undefined as never);
}

test("the built default template passes the validator and round-trips", () => {
  assert.deepEqual(templateOf(writeTemplate(defaultTemplate())), defaultTemplate());
});

test("a template with every kind and optional field round-trips", () => {
  assert.deepEqual(templateOf(writeTemplate(everything)), everything);
});

test("a written file starts with its format and version", () => {
  const file = fileOf(everything);
  assert.deepEqual(Object.keys(file).slice(0, 2), ["format", "version"]);
  assert.equal(file.format, TEMPLATE_FORMAT);
  assert.equal(file.version, TEMPLATE_VERSION);
  assert.equal(TEMPLATE_FORMAT, "petroviz-template");
});

test("text that isn't JSON, or isn't an object, is rejected", () => {
  assert.match(problemsOf("{ tracks: ")[0], /^The file isn't JSON/);
  assert.deepEqual(problemsOf([1, 2]), ["The file should hold a JSON object, not a list"]);
  assert.deepEqual(problemsOf("null"), ["The file should hold a JSON object, not null"]);
});

test("a file of another format is rejected on its format alone", () => {
  assert.deepEqual(problemsOf({ name: "x" }), ['format is missing: a template file has "format": "petroviz-template"']);
  assert.deepEqual(problemsOf({ ...fileOf(everything), format: "something-else" }), [
    'format should be "petroviz-template", not "something-else"',
  ]);
});

test("a newer version is rejected with a message, whatever else it holds", () => {
  assert.deepEqual(problemsOf({ format: TEMPLATE_FORMAT, version: TEMPLATE_VERSION + 1, tracks: "?" }), [
    `This template is version ${TEMPLATE_VERSION + 1}, saved by a newer petroviz than this page, which reads up to version ${TEMPLATE_VERSION}. Reload the page to update it.`,
  ]);
});

test("a version that isn't a whole number from 1 is rejected", () => {
  for (const version of [0, -1, 1.5, "1", null, undefined]) {
    const problems = problemsOf({ ...fileOf(everything), version });
    assert.equal(problems.length, 1);
    assert.match(problems[0], /^version (should be a whole number from 1|is missing)/);
  }
});

test("a missing name or tracks, and a wrong description, are each listed", () => {
  const { name, tracks, ...rest } = fileOf(everything);
  assert.deepEqual(problemsOf({ ...rest, description: 3 }), [
    "name is missing",
    "description should be text, not 3",
    "tracks is missing",
  ]);
  assert.deepEqual(problemsOf({ ...rest, name, tracks: {} }), ["tracks should be a list, not an object"]);
});

test("wrong types in tracks, entries and fills are all listed, with where they are", () => {
  const file = fileOf(everything);
  const [gr, depth, , lithology, group] = file.tracks;
  gr.width = "1";
  gr.curves[0].select[1] = { by: "name", value: 7 };
  gr.curves[0].scale.type = "cubic";
  gr.curves[0].offScale = undefined;
  gr.curves[0].style = { colour: "red", width: 0, dash: "wavy" };
  gr.curves[1].scale.ends = { kind: "centredOnMedian", width: -5, reversed: "yes" };
  gr.fills[0].colourWhereALeft = "#FFFF00";
  gr.fills[1].a = { kind: "edge", edge: "middle" };
  depth.ref = "tvd";
  lithology.curve.codes["30000"] = { colour: "#FFFF00", pattern: 999 };
  group.colours["Viking Gp."] = 12;
  assert.deepEqual(problemsOf(file), [
    'tracks[0].width should be a number above 0, not "1"',
    'tracks[0].curves[0].select[1].by should be one of key, mnemonic, family, not "name"',
    "tracks[0].curves[0].select[1].value should be text, not 7",
    'tracks[0].curves[0].scale.type should be one of linear, log, not "cubic"',
    "tracks[0].curves[0].offScale is missing",
    'tracks[0].curves[0].style.colour should be a colour like #RRGGBB, not "red"',
    "tracks[0].curves[0].style.width should be a number above 0, not 0",
    'tracks[0].curves[0].style.dash should be one of solid, dashed, dotted, dashdot, not "wavy"',
    "tracks[0].curves[1].scale.ends.width should be a number above 0, not -5",
    'tracks[0].curves[1].scale.ends.reversed should be true or false, not "yes"',
    'tracks[0].fills[0].colourWhereALeft should be a colour like #RRGGBBAA, not "#FFFF00"',
    'tracks[0].fills[1].a.edge should be one of left, right, not "middle"',
    'tracks[1].ref should be one of active, md, tvdss, not "tvd"',
    'tracks[3].curve.codes["30000"].pattern should be one of 607, 620, 623, 626, 627, 642, 658, 667, 668, 670, 711, 718, not 999',
    'tracks[4].colours["Viking Gp."] should be a colour like #RRGGBB, not 12',
  ]);
});

test("scale ends that can't make a scale are listed", () => {
  const file = fileOf(everything);
  const [gr] = file.tracks;
  gr.curves[0].scale.ends = { kind: "fixed", left: 5, right: 5, unit: "gAPI" };
  gr.curves[1].scale = { type: "log", ends: { kind: "fixed", left: 0, right: 100, unit: 1 } };
  gr.curves[2].scale.ends = { kind: "percentile", lo: 99, hi: 101, reversed: false };
  assert.deepEqual(problemsOf(file), [
    "tracks[0].curves[0].scale.ends.right should differ from left",
    "tracks[0].curves[1].scale.ends.unit should be text, not 1",
    "tracks[0].curves[1].scale.ends.left should be above 0 on a log scale, not 0",
    "tracks[0].curves[2].scale.ends.hi should be a number from 0 to 100, not 101",
  ]);
  gr.curves[2].scale.ends = { kind: "percentile", lo: 60, hi: 40, reversed: false };
  gr.curves[0].scale.ends = { kind: "sigma" };
  gr.curves[1].scale.ends = { kind: "fixed", left: 1, right: 100, unit: "ohm·m" };
  assert.deepEqual(problemsOf(file), [
    'tracks[0].curves[0].scale.ends.kind should be one of fixed, centredOnMedian, percentile, not "sigma"',
    "tracks[0].curves[2].scale.ends.hi should be above lo",
  ]);
});

test("an unknown track kind within a known version is rejected", () => {
  const file = fileOf(everything);
  file.tracks[1] = { id: "heat", kind: "heatmap", width: 1 };
  file.tracks.push("track");
  assert.deepEqual(problemsOf(file), [
    'tracks[1].kind should be one of curve, depth, discrete, zone, not "heatmap"',
    'tracks[6] should be an object, not "track"',
  ]);
});

test("a fill naming an unknown id, or one that can't draw, is rejected", () => {
  const file = fileOf(everything);
  const [gr] = file.tracks;
  gr.fills[0].b = { kind: "curve", id: "nope" };
  gr.fills[1] = { ...gr.fills[1], a: { kind: "value", value: 3 }, b: { kind: "edge", edge: "right" } };
  gr.fills.push({ ...gr.fills[1], id: "values", a: { kind: "value", value: 1 }, b: { kind: "value", value: 2 } });
  gr.fills.push({ ...gr.fills[1], id: "lith", a: { kind: "curve", id: "lithology" }, b: { kind: "edge", edge: "right" } });
  gr.fills.push({ ...gr.fills[1], id: "nan", a: { kind: "curve", id: "gr" }, b: { kind: "value", value: "75" } });
  assert.deepEqual(problemsOf(file), [
    'tracks[0].fills[0].b names "nope", which isn\'t a curve in this track',
    "tracks[0].fills[1] needs a curve on at least one side",
    "tracks[0].fills[1].a is a value, which needs a curve on the other side",
    "tracks[0].fills[2] needs a curve on at least one side",
    "tracks[0].fills[2].a is a value, which needs a curve on the other side",
    "tracks[0].fills[2].b is a value, which needs a curve on the other side",
    'tracks[0].fills[3].a names "lithology", which isn\'t a curve in this track',
    'tracks[0].fills[4].b.value should be a number, not "75"',
  ]);
});

test("a fill is checked against its track's entry ids even when an entry is wrong otherwise", () => {
  const file = fileOf(everything);
  const [gr] = file.tracks;
  gr.curves[0].offScale = "bounce";
  gr.fills[0].b = { kind: "curve", id: "nope" };
  assert.deepEqual(problemsOf(file), [
    'tracks[0].curves[0].offScale should be one of wrap, clip, not "bounce"',
    'tracks[0].fills[0].b names "nope", which isn\'t a curve in this track',
  ]);
});

test("ids used twice are rejected: tracks, entries across the template, and fills", () => {
  const file = fileOf(everything);
  const [gr, , tvdss, lithology] = file.tracks;
  tvdss.id = "depth";
  gr.curves[2].id = "sp";
  gr.fills[1].id = "sand";
  lithology.curve.id = "gr";
  assert.deepEqual(problemsOf(file), [
    'tracks[0].curves[2].id "sp" is used by another curve entry',
    'tracks[0].fills[1].id "sand" is used by another fill',
    'tracks[2].id "depth" is used by another track',
    'tracks[3].curve.id "gr" is used by another curve entry',
  ]);
});

test("unknown keys are ignored, and left out of the template read", () => {
  const file = fileOf(everything);
  file.savedBy = "a later petroviz";
  file.tracks[0].title = "Gamma";
  file.tracks[0].curves[0].note = "edited";
  file.tracks[0].curves[0].style.opacity = 0.5;
  file.tracks[0].fills[0].pattern = "dots";
  file.tracks[3].curve.codes["30000"].label = "sandstone";
  assert.deepEqual(templateOf(file), everything);
});

test("an older version upgrades forward one version at a time", () => {
  const seen: number[] = [];
  // As if this page read version 3, and version 1 named the curve tracks' entries `entries`.
  const upgrades: Record<number, Upgrade> = {
    1: (file) => {
      seen.push(1);
      const tracks = file.tracks as Record<string, unknown>[];
      return { ...file, tracks: tracks.map(({ entries, ...track }) => (entries ? { ...track, curves: entries } : track)) };
    },
    2: (file) => (seen.push(2), file),
  };
  const v1 = fileOf(everything);
  v1.tracks[0] = { ...v1.tracks[0], entries: v1.tracks[0].curves, curves: undefined };
  assert.deepEqual(templateOf(v1, { version: 3, upgrades }), everything);
  assert.deepEqual(seen, [1, 2]);

  seen.length = 0;
  assert.deepEqual(templateOf({ ...fileOf(everything), version: 3 }, { version: 3, upgrades }), everything);
  assert.deepEqual(seen, []);

  assert.equal(readTemplate(JSON.stringify({ ...fileOf(everything), version: 4 }), { version: 3, upgrades }).ok, false);
});

test("a version with no upgrade written for it is rejected", () => {
  const read = readTemplate(writeTemplate(everything), { version: 2, upgrades: {} });
  assert.deepEqual(read.ok ? [] : read.problems, ["This page can't upgrade a version 1 template."]);
});

test("an upgrade step that fails on an old file rejects it instead of throwing", () => {
  const upgrades: Record<number, Upgrade> = {
    1: () => {
      throw new TypeError("tracks is not iterable");
    },
  };
  const read = readTemplate(writeTemplate(everything), { version: 2, upgrades });
  assert.deepEqual(read.ok ? [] : read.problems, ["This page couldn't upgrade the version 1 template: tracks is not iterable"]);
});

test("the file name is the name's slug, with the template suffix", () => {
  assert.equal(templateFileName("My GR tracks!"), "my-gr-tracks.petroviz-template.json");
  assert.equal(templateFileName("  Default  "), "default.petroviz-template.json");
  assert.equal(templateFileName("Ünïcode ÷ only"), "unicode-only.petroviz-template.json");
  assert.equal(templateFileName("!!!"), "template.petroviz-template.json");
});
