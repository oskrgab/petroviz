import { test } from "node:test";
import assert from "node:assert/strict";
import { curveFamilyOf, MNEMONIC_FAMILIES } from "./families.ts";

test("every FORCE 2020 curve column has its family", () => {
  const force = {
    GR: "gamma-ray",
    SGR: "spectral-gamma-ray",
    SP: "sp",
    CALI: "caliper",
    BS: "bit-size",
    DCAL: "differential-caliper",
    RDEP: "resistivity-deep",
    RMED: "resistivity-medium",
    RSHA: "resistivity-shallow",
    RXO: "resistivity-micro",
    RMIC: "resistivity-micro",
    RHOB: "bulk-density",
    DRHO: "density-correction",
    NPHI: "neutron-porosity",
    PEF: "pef",
    DTC: "sonic-compressional",
    DTS: "sonic-shear",
    ROP: "rop",
    ROPA: "rop",
    MUDWEIGHT: "mud-weight",
    FORCE_2020_LITHOFACIES_LITHOLOGY: "lithology",
  };
  for (const [mnemonic, family] of Object.entries(force)) {
    assert.equal(curveFamilyOf(mnemonic), family, mnemonic);
  }
});

test("DCAL is a differential caliper, not a caliper", () => {
  assert.equal(curveFamilyOf("DCAL", "in"), "differential-caliper");
});

test("RXO and RMIC are micro-resistivity, not shallow", () => {
  assert.equal(curveFamilyOf("RXO", "ohm·m"), "resistivity-micro");
  assert.equal(curveFamilyOf("RMIC", "ohm·m"), "resistivity-micro");
  assert.equal(curveFamilyOf("MSFL"), "resistivity-micro");
});

test("common LAS mnemonics map to their family", () => {
  assert.equal(curveFamilyOf("ILD"), "resistivity-deep");
  assert.equal(curveFamilyOf("LLS"), "resistivity-medium");
  assert.equal(curveFamilyOf("SFLU"), "resistivity-shallow");
  assert.equal(curveFamilyOf("TNPH"), "neutron-porosity");
  assert.equal(curveFamilyOf("RHOZ"), "bulk-density");
  assert.equal(curveFamilyOf("DT"), "sonic-compressional");
  assert.equal(curveFamilyOf("DTSM"), "sonic-shear");
  assert.equal(curveFamilyOf("HCAL"), "caliper");
  assert.equal(curveFamilyOf("PE"), "pef");
});

test("the table covers about 90 LAS mnemonics besides FORCE 2020's", () => {
  assert.ok(Object.keys(MNEMONIC_FAMILIES).length >= 90);
});

test("mnemonics match whatever their case", () => {
  assert.equal(curveFamilyOf("gr"), "gamma-ray");
  assert.equal(curveFamilyOf("Rhob"), "bulk-density");
});

test("an unknown mnemonic falls back on its unit", () => {
  assert.equal(curveFamilyOf("XGR", "gAPI"), "gamma-ray");
  assert.equal(curveFamilyOf("XSP", "mV"), "sp");
  assert.equal(curveFamilyOf("XPE", "B/E"), "pef");
  assert.equal(curveFamilyOf("XDT", "us/ft"), "sonic-compressional");
  assert.equal(curveFamilyOf("XDT", "µs/ft"), "sonic-compressional");
  assert.equal(curveFamilyOf("XROP", "ft/h"), "rop");
  // A resistivity unit can't tell deep from shallow.
  assert.equal(curveFamilyOf("RLA1", "ohmm"), "resistivity-unknown-depth");
  assert.equal(curveFamilyOf("RLA1", "OHM.M"), "resistivity-unknown-depth");
});

test("the mnemonic wins over the unit", () => {
  assert.equal(curveFamilyOf("RDEP", "gAPI"), "resistivity-deep");
});

test("a curve with neither a known mnemonic nor a known unit is unknown", () => {
  assert.equal(curveFamilyOf("FOO", "furlongs"), "unknown");
  assert.equal(curveFamilyOf(""), "unknown");
});
