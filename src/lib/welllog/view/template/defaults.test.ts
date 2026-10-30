import { test } from "node:test";
import assert from "node:assert/strict";
import { CURVE_FAMILIES } from "../../core/index.ts";
import { curveFamilyDefaults, defaultTemplate } from "./defaults.ts";

// Node 24 has t.assert.snapshot; the @types/node installed (20, through vite) predates it.
type SnapshotContext = { assert: { snapshot(value: unknown): void } };

// After a deliberate change: node --test --test-update-snapshots <this file>
test("the built default template matches its snapshot", (t) => {
  (t as unknown as SnapshotContext).assert.snapshot(defaultTemplate());
});

test("every call builds the same template", () => {
  assert.deepEqual(defaultTemplate(), defaultTemplate());
});

test("ids are unique across tracks and across curve entries", () => {
  const { tracks } = defaultTemplate();
  const trackIds = tracks.map((t) => t.id);
  const entryIds = tracks.flatMap((t) => (t.kind === "curve" ? t.curves.map((c) => c.id) : []));
  assert.equal(new Set(trackIds).size, trackIds.length);
  assert.equal(new Set(entryIds).size, entryIds.length);
});

test("curve family defaults key on real curve families", () => {
  for (const name of Object.keys(curveFamilyDefaults)) {
    assert.ok((CURVE_FAMILIES as readonly string[]).includes(name), name);
  }
});

test("selectors are family-only, apart from the RXO/RMIC and ROP/ROPA pairs", () => {
  const named = defaultTemplate()
    .tracks.flatMap((t) => (t.kind === "curve" ? t.curves : []))
    .filter((c) => c.select.length !== 1 || c.select[0].by !== "family")
    .map((c) => c.select.map((s) => `${s.by}:${s.value}`).join(" "));
  assert.deepEqual(named, [
    "mnemonic:RXO family:resistivity-micro",
    "mnemonic:RMIC family:resistivity-micro",
    "mnemonic:ROP family:rop",
    "mnemonic:ROPA family:rop",
  ]);
});
