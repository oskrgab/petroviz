import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

import { DEFAULTS, resolveHosts, resolveSources } from "./sources.js";

const HF = "https://huggingface.co/datasets/sumpalabs/petrodb/resolve/main";

test("defaults read tables from the Data host and the schema from the Schema host", () => {
  assert.deepEqual(resolveSources(), [
    { name: "wells", kind: "parquet", url: `${HF}/volve/wells.parquet` },
    {
      name: "daily_production",
      kind: "parquet",
      url: `${HF}/volve/daily_production.parquet`,
    },
    {
      name: "monthly_production",
      kind: "parquet",
      url: `${HF}/volve/monthly_production.parquet`,
    },
    {
      name: "schema",
      kind: "schema",
      url: "https://petrodb.ocortez.com/volve/schema.json",
    },
  ]);
});

/** @param {import("./sources.js").Source[]} sources */
const urlsByName = (sources) =>
  Object.fromEntries(sources.map((s) => [s.name, s.url]));

test("a Schema host override changes only the schema", () => {
  const urls = urlsByName(
    resolveSources({ PUBLIC_SCHEMA_BASE_URL: "https://dev-petrodb.ocortez.com/" }),
  );
  assert.deepEqual(urls, {
    wells: `${HF}/volve/wells.parquet`,
    daily_production: `${HF}/volve/daily_production.parquet`,
    monthly_production: `${HF}/volve/monthly_production.parquet`,
    schema: "https://dev-petrodb.ocortez.com/volve/schema.json",
  });
});

test("a Data host override changes only the tables", () => {
  const urls = urlsByName(
    resolveSources({ PUBLIC_DATA_BASE_URL: "https://dev-petrodb.ocortez.com" }),
  );
  assert.deepEqual(urls, {
    wells: "https://dev-petrodb.ocortez.com/volve/wells.parquet",
    daily_production:
      "https://dev-petrodb.ocortez.com/volve/daily_production.parquet",
    monthly_production:
      "https://dev-petrodb.ocortez.com/volve/monthly_production.parquet",
    schema: "https://petrodb.ocortez.com/volve/schema.json",
  });
});

test("empty overrides fall back to the defaults", () => {
  assert.deepEqual(
    resolveSources({ PUBLIC_DATA_BASE_URL: "", PUBLIC_SCHEMA_JSON: "" }),
    resolveSources(),
  );
});

test("a path given as an absolute URL replaces its base", () => {
  const urls = urlsByName(
    resolveSources({
      PUBLIC_WELLS_PARQUET: "https://mirror.example.org/w.parquet",
      PUBLIC_SCHEMA_JSON: "http://localhost:8000/schema.json",
    }),
  );
  assert.equal(urls.wells, "https://mirror.example.org/w.parquet");
  assert.equal(urls.schema, "http://localhost:8000/schema.json");
  assert.equal(urls.daily_production, `${HF}/volve/daily_production.parquet`);
});

test("hosts resolve to the defaults, trimmed of trailing slashes", () => {
  assert.deepEqual(resolveHosts(), {
    dataHost: HF,
    schemaHost: "https://petrodb.ocortez.com",
  });
  assert.deepEqual(
    resolveHosts({ PUBLIC_SCHEMA_BASE_URL: "https://dev-petrodb.ocortez.com/" }),
    { dataHost: HF, schemaHost: "https://dev-petrodb.ocortez.com" },
  );
});

test(".env.example lists exactly the overrides, each with its default", () => {
  const example = parseEnv(
    readFileSync(new URL("../../../.env.example", import.meta.url), "utf8"),
  );
  assert.deepEqual(example, { ...DEFAULTS });
});
