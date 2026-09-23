import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";

import { checkSources } from "./check-sources.js";

// What the Schema host serves for a path it does not have.
const SCHEMA_HOST_PAGE = {
  status: 200,
  type: "text/html; charset=utf-8",
  body: "<!doctype html><html><body>petrodb</body></html>",
};

/** @type {Record<string, { status: number, type: string, body: string | Buffer }>} */
const ROUTES = {
  "/volve/wells.parquet": {
    status: 200,
    type: "application/octet-stream",
    body: Buffer.concat([Buffer.from("PAR1"), Buffer.alloc(64), Buffer.from("PAR1")]),
  },
  "/schema-host/wells.parquet": SCHEMA_HOST_PAGE,
  "/volve/schema.json": {
    status: 200,
    type: "application/json",
    body: JSON.stringify({ tables: { wells: { columns: [] } } }),
  },
  "/schema-host/schema.json": SCHEMA_HOST_PAGE,
};

/** @type {import("node:http").Server} */
let server;
let base = "";

before(async () => {
  server = createServer((req, res) => {
    if (req.url === "/stalled/wells.parquet") return; // never answer
    const route = ROUTES[req.url ?? ""];
    if (!route) {
      res.writeHead(404, { "content-type": "text/plain" }).end("Not Found");
      return;
    }
    res.writeHead(route.status, { "content-type": route.type }).end(route.body);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(null)));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no port");
  base = `http://127.0.0.1:${address.port}`;
});

after(() => {
  server.closeAllConnections();
  server.close();
});

/**
 * @param {string} name
 * @param {"parquet" | "schema"} kind
 * @param {string} path
 */
async function checkOne(name, kind, path) {
  const [result] = await checkSources([{ name, kind, url: `${base}${path}` }]);
  return result;
}

test("a parquet table that starts with PAR1 passes", async () => {
  const result = await checkOne("wells", "parquet", "/volve/wells.parquet");
  assert.equal(result.ok, true, result.reason);
});

test("an HTML page served with 200 at a parquet path fails, naming what came back", async () => {
  const result = await checkOne("wells", "parquet", "/schema-host/wells.parquet");
  assert.equal(result.ok, false);
  assert.match(result.reason ?? "", /text\/html/);
  assert.match(result.reason ?? "", /<!doctype/);
});

test("a schema that parses as JSON with a tables object passes", async () => {
  const result = await checkOne("schema", "schema", "/volve/schema.json");
  assert.equal(result.ok, true, result.reason);
});

test("a 404 fails, naming the status", async () => {
  const result = await checkOne("wells", "parquet", "/missing/wells.parquet");
  assert.equal(result.ok, false);
  assert.match(result.reason ?? "", /HTTP 404/);
});

test("a schema body that is not JSON fails", async () => {
  const result = await checkOne("schema", "schema", "/schema-host/schema.json");
  assert.equal(result.ok, false);
  assert.match(result.reason ?? "", /not JSON/);
});

test("an unreachable host fails instead of throwing", async () => {
  const [result] = await checkSources([
    { name: "wells", kind: "parquet", url: "http://127.0.0.1:1/wells.parquet" },
  ]);
  assert.equal(result.ok, false);
  assert.match(result.reason ?? "", /request failed/);
});

test("a host that never answers fails once the timeout passes", async () => {
  const [result] = await checkSources(
    [{ name: "wells", kind: "parquet", url: `${base}/stalled/wells.parquet` }],
    { timeoutMs: 200 },
  );
  assert.equal(result.ok, false);
  assert.match(result.reason ?? "", /request failed/);
});
