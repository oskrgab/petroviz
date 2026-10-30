import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_WELL, parseLink, roundMd, sourceKey, writeLink, type LogLink } from "./link.ts";

const parse = (search: string) => parseLink(new URLSearchParams(search));
const write = (link: LogLink) => writeLink(link).toString();

test("a link names the well, the depth reference and the MD interval", () => {
  assert.deepEqual(parse("well=34-10-16_R&ref=tvdss&md=2100.0-2350.0"), {
    source: { kind: "well", id: "34-10-16_R" },
    ref: "tvdss",
    interval: { top: 2100, base: 2350 },
  });
});

test("links round-trip through write and parse", () => {
  const links: LogLink[] = [
    { source: { kind: "well", id: "34-10-16_R" }, ref: "tvdss", interval: { top: 2100, base: 2350.5 } },
    { source: { kind: "well", id: "35-11-11" }, ref: "md", interval: null },
    { source: { kind: "las", fileName: "well a (copy).las" }, ref: "md", interval: { top: 1200, base: 1450 } },
    { source: { kind: "well", id: "7-1-1" }, ref: "md", interval: { top: -12.5, base: 40 } },
  ];
  for (const link of links) assert.deepEqual(parse(write(link)), link);
});

test("parameters are written in the ADR's order, with md to one decimal", () => {
  assert.equal(
    write({ source: { kind: "well", id: "34-10-16_R" }, ref: "tvdss", interval: { top: 2100, base: 2350 } }),
    "well=34-10-16_R&ref=tvdss&md=2100.0-2350.0",
  );
  assert.equal(
    write({ source: { kind: "las", fileName: "well_a.las" }, ref: "md", interval: { top: 1200, base: 1450 } }),
    "las=well_a.las&md=1200.0-1450.0",
  );
});

test("md is rounded to 0.1", () => {
  assert.equal(
    write({ source: { kind: "well", id: "35-11-11" }, ref: "md", interval: { top: 2100.04999, base: 2350.06 } }),
    "well=35-11-11&md=2100.0-2350.1",
  );
  assert.equal(roundMd(1234.5678), 1234.6);
  assert.equal(roundMd(0.3 * 3), 0.9);
  assert.equal(roundMd(-0.04), 0);
});

test("an interval that rounds to nothing keeps a tenth, so the link still parses", () => {
  const search = write({ source: { kind: "well", id: "35-11-11" }, ref: "md", interval: { top: 100.01, base: 100.03 } });
  assert.equal(search, "well=35-11-11&md=100.0-100.1");
  assert.deepEqual(parse(search).interval, { top: 100, base: 100.1 });
});

test("ref is absent for MD, and anything but tvdss reads as MD", () => {
  assert.equal(write({ source: { kind: "well", id: "35-11-11" }, ref: "md", interval: null }), "well=35-11-11");
  assert.equal(parse("well=35-11-11").ref, "md");
  assert.equal(parse("well=35-11-11&ref=TVDSS").ref, "tvdss");
  assert.equal(parse("well=35-11-11&ref=md").ref, "md");
  assert.equal(parse("well=35-11-11&ref=tvd").ref, "md");
});

test("las replaces well", () => {
  assert.deepEqual(parse("las=well_a.las&md=1200.0-1450.0").source, { kind: "las", fileName: "well_a.las" });
  assert.deepEqual(parse("well=35-11-11&las=well_a.las").source, { kind: "las", fileName: "well_a.las" });
});

test("a well must be letters, digits, _ and -; anything else is an unknown well", () => {
  assert.deepEqual(parse("well=34-10-16_R").source, { kind: "well", id: "34-10-16_R" });
  for (const name of ["34/10-16 R", "../secret", "35-11-11.parquet", "a%2Fb", "35-11-11?x"]) {
    assert.deepEqual(parse(new URLSearchParams({ well: name }).toString()).source, { kind: "unknown-well", name });
  }
});

test("no well and no las names nothing, so the page opens the default well", () => {
  assert.deepEqual(parse("").source, { kind: "none" });
  assert.deepEqual(parse("well=&las=").source, { kind: "none" });
  assert.deepEqual(parse("md=10-20").source, { kind: "none" });
  assert.equal(DEFAULT_WELL, "35-11-11");
});

test("an md that won't parse, or whose top isn't above its base, is ignored", () => {
  for (const md of ["", "abc", "2100", "2100-", "-2100", "2100-2350-2400", "2100,0-2350,0", "1e3-2e3", "2350.0-2100.0", "2100.0-2100.0", "Infinity-NaN"]) {
    assert.equal(parse(new URLSearchParams({ well: "35-11-11", md }).toString()).interval, null, `md=${md}`);
  }
});

test("an md above the surface parses, negative ends included", () => {
  assert.deepEqual(parse("well=35-11-11&md=-25.5-100").interval, { top: -25.5, base: 100 });
  assert.deepEqual(parse("well=35-11-11&md=-40--10").interval, { top: -40, base: -10 });
});

test("an interval outside the well is passed through for the log view to clamp", () => {
  assert.deepEqual(parse("well=35-11-11&md=90000.0-99000.0").interval, { top: 90000, base: 99000 });
});

test("a source's key tells wells and LAS files apart, and names the well a bare link opens", () => {
  assert.equal(sourceKey({ kind: "well", id: "35-11-11" }), "well:35-11-11");
  assert.equal(sourceKey({ kind: "none" }), "well:35-11-11");
  assert.equal(sourceKey({ kind: "unknown-well", name: "../secret" }), "well:../secret");
  assert.equal(sourceKey({ kind: "las", fileName: "35-11-11" }), "las:35-11-11");
  assert.notEqual(sourceKey({ kind: "las", fileName: "a.las" }), sourceKey({ kind: "las", fileName: "b.las" }));
});
