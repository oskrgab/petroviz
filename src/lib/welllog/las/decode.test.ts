import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decodeLas } from "./decode.ts";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/lasio/${name}`, import.meta.url));

const bytes = (...values: number[]) => Uint8Array.from(values);

test("a UTF-8 byte order mark is read as UTF-8 and dropped", () => {
  assert.equal(decodeLas(bytes(0xef, 0xbb, 0xbf, 0x7e, 0xc2, 0xba)), "~º");
});

test("UTF-16 byte order marks pick little- or big-endian and are dropped", () => {
  assert.equal(decodeLas(bytes(0xff, 0xfe, 0x7e, 0x00, 0xba, 0x00)), "~º");
  assert.equal(decodeLas(bytes(0xfe, 0xff, 0x00, 0x7e, 0x00, 0xba)), "~º");
});

test("without a byte order mark, valid UTF-8 is read as UTF-8", () => {
  assert.equal(decodeLas(bytes(0x7e, 0xc2, 0xba, 0xd0, 0xbc)), "~ºм");
});

test("without a byte order mark, bytes that aren't UTF-8 are read as windows-1252", () => {
  // 0xBA is º in both windows-1252 and Latin-1; 0x80 is € only in windows-1252.
  assert.equal(decodeLas(bytes(0x7e, 0xba, 0x80)), "~º€");
});

test("lasio's encoding fixtures decode to the same text", () => {
  const utf8 = decodeLas(fixture("encodings_utf8.las"));
  assert.ok(utf8.includes("ºᶟᵌᴬń"));
  assert.equal(decodeLas(fixture("encodings_utf8wbom.las")), utf8);
  assert.equal(decodeLas(fixture("encodings_utf16lebom.las")), utf8);
  assert.equal(decodeLas(fixture("encodings_utf16bebom.las")), utf8);
  assert.ok(decodeLas(fixture("encodings_cp1252.las")).includes("º"));
});
