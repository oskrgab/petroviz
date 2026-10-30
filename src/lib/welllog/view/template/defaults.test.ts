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

test("SP, mud weight and unknown-depth resistivity join their tracks, after the families before them", () => {
  const ids = (id: string) =>
    defaultTemplate()
      .tracks.filter((t) => t.id === id)
      .flatMap((t) => (t.kind === "curve" ? t.curves.map((c) => c.id) : []));
  assert.deepEqual(ids("gr-caliper"), ["gamma-ray", "spectral-gamma-ray", "sp", "caliper", "bit-size"]);
  assert.deepEqual(ids("resistivity").at(-1), "resistivity-unknown-depth");
  assert.deepEqual(ids("drilling"), ["rop", "ropa", "mud-weight"]);
});

test("wrap is on for GR, SGR, caliper, bit size, DTC and DTS only", () => {
  const wrapped = Object.entries(curveFamilyDefaults)
    .filter(([, d]) => d.offScale === "wrap")
    .map(([name]) => name);
  assert.deepEqual(wrapped, ["gamma-ray", "spectral-gamma-ray", "caliper", "bit-size", "sonic-compressional", "sonic-shear"]);
});

test("unknown curves get a grey percentile [1, 99] scale and stay out of the default template", () => {
  assert.deepEqual(curveFamilyDefaults.unknown, {
    label: "Unknown",
    track: null,
    scale: { type: "linear", ends: { kind: "percentile", lo: 1, hi: 99, reversed: false } },
    offScale: "clip",
    style: { colour: "#808080", width: 1, dash: "solid" },
  });
  const families = defaultTemplate().tracks.flatMap((t) => (t.kind === "curve" ? t.curves.flatMap((c) => c.select) : []));
  assert.ok(!families.some((s) => s.value === "unknown"));
});
