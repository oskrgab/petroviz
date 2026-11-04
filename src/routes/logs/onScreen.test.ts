import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveCatalog, visualizationById } from "../../lib/config/catalog.js";
import { onScreenOf, tabTitle, wellDataset } from "./onScreen.ts";

const logs = visualizationById(resolveCatalog(), "logs");
const force2020 = wellDataset(logs);

test("a petrodb well is from FORCE 2020, with the catalog's links", () => {
  assert.equal(force2020.name, "FORCE 2020");
  assert.equal(force2020.docs, "https://petrodb.ocortez.com/force_2020/");
  assert.equal(force2020.license, "https://creativecommons.org/licenses/by/4.0/");
});

test("the well logs must show FORCE 2020 for their petrodb wells to name it", () => {
  const without = { ...logs, datasets: logs.datasets.filter((d) => d.id !== "force_2020") };
  assert.throws(() => wellDataset(without), /FORCE 2020/);
});

test("a petrodb well puts its dataset on the line", () => {
  assert.deepEqual(onScreenOf({ kind: "well", id: "35-11-11" }, force2020), { dataset: force2020 });
});

test("a link naming no well opens the default one, from the same dataset", () => {
  assert.deepEqual(onScreenOf({ kind: "none" }, force2020), { dataset: force2020 });
  assert.deepEqual(onScreenOf({ kind: "unknown-well", name: "nope" }, force2020), { dataset: force2020 });
});

test("an opened LAS file puts its file name on the line, and no dataset", () => {
  assert.deepEqual(onScreenOf({ kind: "las", fileName: "well a (copy).las" }, force2020), {
    file: "well a (copy).las",
  });
});

test("the tab title names the well, the dataset and Well logs", () => {
  assert.equal(tabTitle("35/11-11", { dataset: force2020 }, logs), "35/11-11 · FORCE 2020 · Well logs");
});

test("the tab title names an opened file's well and the file", () => {
  assert.equal(tabTitle("WELL-A", { file: "well_a.las" }, logs), "WELL-A · well_a.las · Well logs");
});

test("a file with no WELL item is named by the file alone", () => {
  // The picker names such a file's well by the file name
  assert.equal(tabTitle("well_a.las", { file: "well_a.las" }, logs), "well_a.las · Well logs");
});

test("while the first well loads, the title names the dataset the line does", () => {
  assert.equal(tabTitle(null, { dataset: force2020 }, logs), "FORCE 2020 · Well logs");
});

test("with no line, the title names Well logs and petroviz", () => {
  assert.equal(tabTitle(null, undefined, logs), "Well logs · petroviz");
});

test("the title takes the visualization's name from the catalog", () => {
  const renamed = { ...logs, name: "Logs" };
  assert.equal(tabTitle("35/11-11", { dataset: force2020 }, renamed), "35/11-11 · FORCE 2020 · Logs");
});
