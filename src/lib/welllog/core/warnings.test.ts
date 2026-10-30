import { test } from "node:test";
import assert from "node:assert/strict";
import { LOAD_WARNING_CODES, severityOf } from "./warnings.ts";

// The spec's table, written out by hand (#38, Implementation Decisions).
const SPEC = {
  "sentinel-replaced": "note",
  "duplicate-mnemonic-renamed": "note",
  "gap-inserted": "note",
  "depth-sorted": "note",
  "step-mismatch": "note",
  "curve-empty": "note",
  "duplicate-depth-dropped": "caution",
  "row-dropped": "caution",
  "curves-dropped": "caution",
  "columns-ignored": "caution",
  "depth-unit-assumed": "caution",
  "version-assumed": "caution",
  "tvdss-not-monotonic": "caution",
  "discrete-read-as-continuous": "caution",
  "value-unreadable": "caution",
} as const;

test("every code has the severity the spec gives it", () => {
  for (const [code, severity] of Object.entries(SPEC)) {
    assert.equal(severityOf(code as keyof typeof SPEC), severity, code);
  }
});

test("the set of codes is exactly the spec's, no more", () => {
  assert.deepEqual([...LOAD_WARNING_CODES].sort(), Object.keys(SPEC).sort());
});
