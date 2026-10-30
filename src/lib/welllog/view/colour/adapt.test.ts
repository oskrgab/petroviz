import { test } from "node:test";
import assert from "node:assert/strict";
import { adaptFill, adaptStroke, isDarkBackground, oklch, quotedContrast } from "./adapt.ts";
import { contrastRatio } from "./contrast.ts";
import { curveFamilyDefaults, defaultTemplate } from "../template/defaults.ts";

/** The --welllog-bg tokens LogView sets per scheme. */
const DARK = "#0f172a";
const LIGHT = "#ffffff";

test("a background is dark below a relative luminance of 0.18, whatever the theme is called", () => {
  assert.equal(isDarkBackground(DARK), true);
  assert.equal(isDarkBackground("#1e293b"), true);
  assert.equal(isDarkBackground(LIGHT), false);
  assert.equal(isDarkBackground("#f1f5f9"), false);
  // #767676 sits at 0.181, #757575 at 0.178.
  assert.equal(isDarkBackground("#767676"), false);
  assert.equal(isDarkBackground("#757575"), true);
});

test("ADR-0006's examples on the dark track", () => {
  // Pure red is 4.46:1 there, 4.5:1 as quoted.
  assert.equal(quotedContrast("#FF0000", DARK), 4.5);
  assert.equal(adaptStroke("#000000", DARK), "#FFFFFF");
  assert.equal(adaptStroke("#330000", DARK), "#EEA99F");
  assert.equal(adaptStroke("#0000CC", DARK), "#437BFF");
  assert.equal(adaptStroke("#FF0000", DARK), "#FF0000");
});

test("the default template's strokes on the dark track (#37)", () => {
  const table: [string, string][] = [
    ["#006400", "#3E9139"], // GR
    ["#0000FF", "#3E77FF"], // SP
    ["#CC0000", "#EE3A2C"], // RMED
    ["#800080", "#C253C0"], // DTC
    ["#8B4513", "#B76D40"], // mud weight
  ];
  for (const [stored, drawn] of table) assert.equal(adaptStroke(stored, DARK), drawn, stored);
});

test("CALI, RHOB, NPHI, DTS and RSHA are drawn as stored on the dark track (#37)", () => {
  for (const family of ["caliper", "bulk-density", "neutron-porosity", "sonic-shear", "resistivity-shallow"] as const) {
    const { colour } = curveFamilyDefaults[family].style;
    assert.equal(adaptStroke(colour, DARK), colour, family);
  }
});

test("every adapted stroke reaches 4.5:1 against the track, quoted to one decimal", () => {
  const strokes = [
    ...Object.values(curveFamilyDefaults).map((d) => d.style.colour),
    "#330000",
    "#0000CC",
    "#1F1F1F",
    "#404040",
    "#003366",
    "#4B0082",
    "#556B2F",
    "#2F4F4F",
    "#8B0000",
    "#000080",
    "#663399",
  ];
  for (const background of [DARK, "#1e293b", "#162033", "#000000"]) {
    for (const stored of strokes) {
      const drawn = adaptStroke(stored, background);
      assert.ok(quotedContrast(drawn, background) >= 4.5, `${stored} → ${drawn} on ${background}`);
      assert.ok(contrastRatio(drawn, background) > 4.45, `${stored} → ${drawn} on ${background}`);
    }
  }
});

test("mirroring keeps the hue", () => {
  for (const stored of ["#330000", "#0000CC", "#006400", "#800080"]) {
    const before = oklch(stored);
    const after = oklch(adaptStroke(stored, DARK));
    assert.ok(after.L > 0.5, stored);
    const turn = Math.abs(((after.h - before.h + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
    assert.ok(turn < 0.05, `${stored}: hue moved by ${turn} rad`);
  }
});

test("a stroke already on the light side is only lifted, not mirrored", () => {
  // #6B6B6B is a grey just above L 0.5, at 3.3:1 on the dark track.
  const drawn = adaptStroke("#6B6B6B", DARK);
  assert.ok(oklch(drawn).L > oklch("#6B6B6B").L);
  assert.ok(oklch(drawn).L < 0.75, drawn);
  assert.ok(quotedContrast(drawn, DARK) >= 4.5);
});

test("an alpha on a stroke is kept", () => {
  assert.equal(adaptStroke("#00000080", DARK), "#FFFFFF80");
});

test("nothing changes on a light background", () => {
  const colours = [
    ...Object.values(curveFamilyDefaults).map((d) => d.style.colour),
    "#330000",
    "#FFFF00",
    "#FFA500",
    "#BEBEBE66",
  ];
  for (const background of [LIGHT, "#f1f5f9", "#e9e7e2"]) {
    for (const stored of colours) {
      assert.equal(adaptStroke(stored, background), stored, `${stored} on ${background}`);
      assert.equal(adaptFill(stored, background), stored, `${stored} on ${background}`);
    }
  }
});

test("on dark, a grey fill has its lightness mirrored while yellow is unchanged", () => {
  const grey = adaptFill("#BEBEBE66", DARK);
  assert.match(grey, /^#[0-9A-F]{6}66$/);
  assert.ok(oklch(grey).L < 0.5, grey);
  assert.ok(Math.abs(oklch(grey).L - (1 - oklch("#BEBEBE").L)) < 0.01, grey);
  assert.ok(oklch(grey).C < 0.03, grey);
  assert.equal(adaptFill("#FFFF0066", DARK), "#FFFF0066");
});

test("the default template's fills on dark: only the near-neutral ones change", () => {
  const sides = defaultTemplate().tracks.flatMap((track) =>
    track.kind === "curve" ? (track.fills ?? []).flatMap((fill) => [fill.colourWhereALeft, fill.colourWhereARight]) : [],
  );
  assert.ok(sides.length > 0);
  for (const stored of sides) {
    const drawn = adaptFill(stored, DARK);
    assert.equal(drawn.slice(7), stored.slice(7), `${stored}: alpha kept`);
    if (oklch(stored).C >= 0.03) assert.equal(drawn, stored);
  }
  // The transparent side mirrors too, and stays transparent.
  assert.equal(adaptFill("#00000000", DARK), "#FFFFFF00");
});

test("a second call, and a lower-case spelling, give the same colour", () => {
  assert.equal(adaptStroke("#0000CC", DARK), adaptStroke("#0000CC", DARK));
  assert.equal(adaptStroke("#0000cc", DARK), "#437BFF");
});
