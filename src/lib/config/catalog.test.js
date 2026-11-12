import { test } from "node:test";
import assert from "node:assert/strict";

import { readFile } from "node:fs/promises";

import { resolveCatalog, visualizationById } from "./catalog.js";

const HF_TREE = "https://huggingface.co/datasets/oskrgab/petrodb/tree/main";

/** @param {import("./catalog.js").Catalog} catalog @param {string} id */
const dataset = (catalog, id) => {
  const found = catalog.datasets.find((d) => d.id === id);
  assert.ok(found, `no dataset ${id}`);
  return found;
};

test("the visualizations are the production dashboard and the well logs, at their routes", () => {
  const { visualizations } = resolveCatalog();
  assert.deepEqual(
    visualizations.map((v) => [v.name, v.route]),
    [
      ["Production dashboard", "/production"],
      ["Well logs", "/logs"],
    ],
  );
});

test("production runs along time and the well logs along depth", () => {
  const { visualizations } = resolveCatalog();
  assert.deepEqual(
    visualizations.map((v) => [v.route, v.runsAlong]),
    [
      ["/production", "time"],
      ["/logs", "depth"],
    ],
  );
});

test("only the well logs take a file the user opens", () => {
  const { visualizations } = resolveCatalog();
  assert.deepEqual(
    visualizations.filter((v) => v.takesFile).map((v) => v.route),
    ["/logs"],
  );
});

test("the production dashboard shows Volve and the well logs show FORCE 2020", () => {
  const catalog = resolveCatalog();
  assert.deepEqual(
    catalog.visualizations.map((v) => [
      v.route,
      v.datasets.map((d) => d.name),
    ]),
    [
      ["/production", ["Volve"]],
      ["/logs", ["FORCE 2020"]],
    ],
  );
});

test("every dataset a visualization names exists, and every dataset is shown somewhere", () => {
  const { datasets, visualizations } = resolveCatalog();
  const shown = new Set(visualizations.flatMap((v) => v.datasets));
  for (const d of shown) assert.ok(datasets.includes(d), `${d.id} not in catalog`);
  for (const d of datasets) assert.ok(shown.has(d), `${d.id} shown by no visualization`);
});

test("by default, Docs are on the petrodb site and Data is the Hugging Face folder", () => {
  const catalog = resolveCatalog();
  assert.deepEqual(
    { docs: dataset(catalog, "volve").docs, data: dataset(catalog, "volve").data },
    {
      docs: "https://petrodb.ocortez.com/volve/",
      data: `${HF_TREE}/volve`,
    },
  );
  assert.deepEqual(
    {
      docs: dataset(catalog, "force_2020").docs,
      data: dataset(catalog, "force_2020").data,
    },
    {
      docs: "https://petrodb.ocortez.com/force_2020/",
      data: `${HF_TREE}/force_2020`,
    },
  );
});

test("overridden hosts move the Docs and Data links, trailing slashes and all", () => {
  const catalog = resolveCatalog({
    PUBLIC_SCHEMA_BASE_URL: "https://dev-petrodb.ocortez.com/",
    PUBLIC_DATA_BASE_URL: "https://mirror.example.org/petrodb/",
  });
  const volve = dataset(catalog, "volve");
  assert.equal(volve.docs, "https://dev-petrodb.ocortez.com/volve/");
  assert.equal(volve.data, "https://mirror.example.org/petrodb/volve/");
  const force = dataset(catalog, "force_2020");
  assert.equal(force.docs, "https://dev-petrodb.ocortez.com/force_2020/");
  assert.equal(force.data, "https://mirror.example.org/petrodb/force_2020/");
});

test("a Hugging Face Data host on another revision browses that revision", () => {
  const catalog = resolveCatalog({
    PUBLIC_DATA_BASE_URL:
      "https://huggingface.co/datasets/someone/fork/resolve/v2/",
  });
  assert.equal(
    dataset(catalog, "force_2020").data,
    "https://huggingface.co/datasets/someone/fork/tree/v2/force_2020",
  );
});

test("License links are the agreed upstream terms", () => {
  const catalog = resolveCatalog();
  assert.equal(
    dataset(catalog, "volve").license,
    "https://cdn.equinor.com/files/h61q9gi9/global/de6532f6134b9a953f6c41bac47a0c055a3712d3.pdf",
  );
  assert.equal(
    dataset(catalog, "force_2020").license,
    "https://creativecommons.org/licenses/by/4.0/",
  );
});

test("by default, each dataset's Data link is said to be on Hugging Face", () => {
  const { datasets } = resolveCatalog();
  assert.deepEqual(
    datasets.map((d) => [d.id, d.dataOn]),
    [
      ["volve", "Hugging Face"],
      ["force_2020", "Hugging Face"],
    ],
  );
});

test("a Data host that isn't Hugging Face is named by its host name", () => {
  const catalog = resolveCatalog({
    PUBLIC_DATA_BASE_URL: "https://mirror.example.org/petrodb/",
  });
  assert.equal(dataset(catalog, "volve").dataOn, "mirror.example.org");
});

test("a visualization is found by its id, and an unknown id is refused", () => {
  const catalog = resolveCatalog();
  const production = visualizationById(catalog, "production");
  assert.equal(production.name, "Production dashboard");
  assert.deepEqual(
    production.datasets.map((d) => d.name),
    ["Volve"],
  );
  assert.throws(() => visualizationById(catalog, "maps"), /Unknown visualization: maps/);
});

test("LICENSE-VOLVE-DATA.md links the same Equinor licence as the catalog", async () => {
  const text = await readFile(
    new URL("../../../LICENSE-VOLVE-DATA.md", import.meta.url),
    "utf8",
  );
  const pdfs = [...text.matchAll(/https:\/\/[^\s)]+\.pdf/g)].map((m) => m[0]);
  assert.ok(pdfs.length > 0, "no licence PDF linked");
  const { license } = dataset(resolveCatalog(), "volve");
  assert.deepEqual([...new Set(pdfs)], [license]);
});
