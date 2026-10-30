import { test } from "node:test";
import assert from "node:assert/strict";
import { SET3, fnv1a, hashedIndex, unknownCodeColours, zoneColours } from "./categorical.ts";
import { LABEL_DARK, LABEL_LIGHT, contrastRatio, labelColour, parseHex, relativeLuminance } from "./contrast.ts";

const zones = (...names: string[]) => names.map((name) => ({ name }));

/** 35/11-11's zone sets, top to bottom, as the FORCE 2020 log adapter builds them. */
const GROUP_35_11_11 = zones(
  "HORDALAND GP.",
  "ROGALAND GP.",
  "SHETLAND GP.",
  "CROMER KNOLL GP.",
  "VIKING GP.",
  "BAAT GP.",
  "DUNLIN GP.",
);
const FORMATION_35_11_11 = zones(
  "Utsira Fm.",
  "Balder Fm.",
  "Sele Fm.",
  "Lista Fm.",
  "Jorsalfare Fm.",
  "Kyrre Fm.",
  "Svarte Fm.",
  "Roedby Fm.",
  "Draupne Fm.",
  "Intra Draupne Fm. Sst.",
  "Heather Fm.",
  "Intra Heather Fm. Sst.",
  "Heather Fm.",
  "Intra Heather Fm. Sst.",
  "Heather Fm.",
  "Tarbert Fm.",
  "Ness Fm.",
  "Etive Fm.",
  "Rannoch Fm.",
  "Oseberg Fm.",
  "Drake Fm.",
);

test("FNV-1a matches its reference values", () => {
  assert.equal(fnv1a(""), 0x811c9dc5);
  assert.equal(fnv1a("a"), 0xe40c292c);
  assert.equal(fnv1a("foobar"), 0xbf9cf968);
});

test("zone colours: neighbours never match in 35/11-11", () => {
  for (const set of [GROUP_35_11_11, FORMATION_35_11_11]) {
    const colours = zoneColours(set);
    for (let i = 1; i < colours.length; i++) {
      assert.notEqual(colours[i], colours[i - 1], `${set[i - 1].name} / ${set[i].name}`);
    }
    for (const colour of colours) assert.ok(SET3.includes(colour));
  }
});

test("zone colours: in 35/11-11 only Svarte Fm. moves, off Kyrre Fm.'s colour", () => {
  const colours = zoneColours(FORMATION_35_11_11);
  const at = (name: string) => colours[FORMATION_35_11_11.findIndex((z) => z.name === name)];
  assert.equal(hashedIndex("Svarte Fm."), hashedIndex("Kyrre Fm."));
  assert.equal(at("Kyrre Fm."), SET3[hashedIndex("Kyrre Fm.")]);
  assert.equal(at("Svarte Fm."), SET3[(hashedIndex("Svarte Fm.") + 1) % SET3.length]);
  const moved = FORMATION_35_11_11.filter(({ name }, i) => colours[i] !== SET3[hashedIndex(name)]).map((z) => z.name);
  assert.deepEqual([...new Set(moved)], ["Svarte Fm."]);
  assert.ok(zoneColours(GROUP_35_11_11).every((colour, i) => colour === SET3[hashedIndex(GROUP_35_11_11[i].name)]));
});

test("zone colours: a name keeps its colour within a well and across wells, unless it had to move", () => {
  const colours = zoneColours(FORMATION_35_11_11);
  const heather = colours.filter((_, i) => FORMATION_35_11_11[i].name === "Heather Fm.");
  assert.equal(new Set(heather).size, 1);

  // Another well: the same names take the same colours…
  const other = zoneColours(zones("Draupne Fm.", "Heather Fm.", "Svarte Fm.", "Kyrre Fm."));
  assert.equal(other[0], colours[FORMATION_35_11_11.findIndex((z) => z.name === "Draupne Fm.")]);
  assert.equal(other[1], heather[0]);
  // …except Svarte Fm., which moved only where Kyrre Fm. sat directly above it.
  assert.equal(other[2], SET3[hashedIndex("Svarte Fm.")]);
  assert.notEqual(other[2], colours[FORMATION_35_11_11.findIndex((z) => z.name === "Svarte Fm.")]);
  // Kyrre Fm. below Svarte Fm. is not new to that rule: it is new, and its colour
  // matches Svarte Fm.'s, so here Kyrre Fm. is the one that moves.
  assert.equal(other[3], SET3[(hashedIndex("Kyrre Fm.") + 1) % SET3.length]);
});

test("zone colours: a template's name → colour map wins, and the move-on rule still sees it", () => {
  const kyrre = SET3[hashedIndex("Kyrre Fm.")];
  const colours = zoneColours(zones("Utsira Fm.", "Kyrre Fm.", "Svarte Fm."), { "Utsira Fm.": "#123456" });
  assert.deepEqual(colours, ["#123456", kyrre, SET3[(hashedIndex("Svarte Fm.") + 1) % SET3.length]]);
  // An overridden zone above with Svarte Fm.'s hashed colour also moves it.
  const [, svarte] = zoneColours(zones("X", "Svarte Fm."), { X: kyrre.toLowerCase() });
  assert.notEqual(svarte.toUpperCase(), kyrre);
});

test("discrete code colours: no repeats up to 12 codes, taken in sorted order", () => {
  for (let n = 1; n <= 12; n++) {
    const codes = Array.from({ length: n }, (_, i) => i + 1);
    const colours = unknownCodeColours(codes);
    assert.equal(new Set(colours.values()).size, n, `${n} codes`);
  }
  // The order codes arrive in doesn't matter, and repeats count once.
  const forward = unknownCodeColours([1, 2, 3, 4, 5, 6, 7, 8]);
  const shuffled = unknownCodeColours([8, 3, 3, 1, 7, 2, 6, 5, 4, 1]);
  assert.deepEqual([...shuffled].sort(([a], [b]) => a - b), [...forward]);
  // The lowest code always gets its hashed colour.
  assert.equal(forward.get(1), SET3[hashedIndex("1")]);
});

test("discrete code colours: past 12 codes, colours repeat", () => {
  const colours = unknownCodeColours(Array.from({ length: 14 }, (_, i) => i));
  assert.equal(colours.size, 14);
  assert.equal(new Set(colours.values()).size, 12);
});

test("relative luminance and contrast follow WCAG 2", () => {
  assert.equal(relativeLuminance("#000000"), 0);
  assert.equal(relativeLuminance("#FFFFFF"), 1);
  assert.equal(contrastRatio("#000000", "#ffffff"), 21);
  assert.equal(contrastRatio("#777777", "#777777"), 1);
  assert.deepEqual(parseHex("#0f8"), { r: 0, g: 255, b: 136 });
  assert.deepEqual(parseHex("#FFFF0066"), { r: 255, g: 255, b: 0 });
  assert.throws(() => parseHex("red"), /Not a hex colour/);
});

test("labels take whichever ink contrasts more: always the dark one on Set3", () => {
  for (const colour of SET3) assert.equal(labelColour(colour), LABEL_DARK, colour);
  assert.equal(labelColour("#FFFFFF"), LABEL_DARK);
  assert.equal(labelColour("#000000"), LABEL_LIGHT);
  assert.equal(labelColour("#1F3B73"), LABEL_LIGHT);
  assert.equal(labelColour("#FF1493"), LABEL_DARK);
});
