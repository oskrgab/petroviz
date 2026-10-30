import { test } from "node:test";
import assert from "node:assert/strict";
import { TOKEN_MISSING, TOKEN_UNREADABLE, isMissingMarker, scanData } from "./scan.ts";

/** What the scanner reads for each token of one data line. */
function scanTokens(tokens: readonly string[]) {
  const scanned = scanData(tokens.join(" "), 0);
  assert.equal(scanned.values.length, tokens.length);
  return scanned;
}

test("the scanner matches Number() on every token that is a finite number", () => {
  const tokens = [
    "0", "-0", "+0", "0.0", "-0.000", "1", "-1", "+1", "1.", ".5", "-.5", "+.5", "123.450", "2550.000",
    "-999.25", "-9999.25", "-9999", "999.25", "0.1", "0.2", "0.3", "1670.875", "379.06760000",
    "6.2506999969", "-2.4598696232", "100091604920", "123456789012345", "1234567890.12345",
    "0.000000000000001", "1234567890123456", "12345678901234567890", "0.1234567890123456789",
    "1e5", "1E-3", "-2.5e+10", "1.0E+02", "0x10", "00012.500", "9007199254740993",
  ];
  const { values, nonNumericAt } = scanTokens(tokens);
  assert.deepEqual(nonNumericAt, []);
  tokens.forEach((token, i) => assert.ok(Object.is(values[i], Number(token)), `${token}: ${values[i]} ≠ ${Number(token)}`));
});

test("the fast path agrees with Number() on many random plain decimals", () => {
  let seed = 7;
  const random = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const tokens: string[] = [];
  for (let k = 0; k < 20000; k++) {
    const digits = 1 + Math.floor(random() * 15);
    let s = "";
    for (let d = 0; d < digits; d++) s += Math.floor(random() * 10);
    const point = Math.floor(random() * (digits + 1));
    const token = `${random() < 0.3 ? "-" : ""}${s.slice(0, point)}.${s.slice(point)}`;
    tokens.push(token === "." || token === "-." ? "0" : token);
  }
  const { values } = scanTokens(tokens);
  tokens.forEach((token, i) => assert.ok(Object.is(values[i], Number(token)), `${token}: ${values[i]} ≠ ${Number(token)}`));
});

test("1.#INF, comma decimals and other text are unreadable, never read as their first digits", () => {
  const tokens = ["1.#INF", "-1.#IND", "123,420", "1,5", "ERR", "(null)", "--", "1.2.3", "Infinity", "-inf", "1D+02"];
  const { values, nonNumericAt, nonNumericKind } = scanTokens(tokens);
  assert.ok(values.every(Number.isNaN));
  assert.deepEqual(nonNumericAt, tokens.map((_, i) => i));
  assert.deepEqual(nonNumericKind, tokens.map(() => TOKEN_UNREADABLE));
});

test("nan, - and #N/A are missing markers", () => {
  const tokens = ["nan", "NaN", "-nan", "NAN", "-", "#N/A", "#n/a"];
  const { values, nonNumericKind } = scanTokens(["1", ...tokens]);
  assert.equal(values[0], 1);
  assert.ok([...values.slice(1)].every(Number.isNaN));
  assert.deepEqual(nonNumericKind, tokens.map(() => TOKEN_MISSING));
  assert.equal(isMissingMarker("--"), false);
  assert.equal(isMissingMarker("#N/A1"), false);
});

test("lines are counted by their tokens; blank and comment lines aren't lines", () => {
  const text = "1 2 3\r\n\n   # a comment 4 5\n\t4\t5\t6 7\r8 9\n";
  const { values, lineCounts } = scanData(text, 0);
  assert.deepEqual([...values], [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(lineCounts, [3, 4, 2]);
});

test("scanning starts at the offset given and stops at a line opening a new ~ section", () => {
  const text = "~A DEPTH GR\n1 2\n3 4\n~Other\n5 6\n";
  const { values, lineCounts } = scanData(text, text.indexOf("\n") + 1);
  assert.deepEqual([...values], [1, 2, 3, 4]);
  assert.deepEqual(lineCounts, [2, 2]);
});

test("a last line without a line break is read", () => {
  const { values, lineCounts } = scanData("1 2\n3 4.5", 0);
  assert.deepEqual([...values], [1, 2, 3, 4.5]);
  assert.deepEqual(lineCounts, [2, 2]);
});

test("the value store grows past its first guess", () => {
  const tokens = Array.from({ length: 5000 }, (_, i) => String(i));
  const { values } = scanData(tokens.join("\n"), 0);
  assert.equal(values.length, 5000);
  assert.equal(values[4999], 4999);
});
