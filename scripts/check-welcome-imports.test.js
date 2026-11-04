import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { formatViolation, scanWelcomeRoute } from "./check-welcome-imports.js";

const REAL_SRC = fileURLToPath(new URL("../src", import.meta.url));

test("the welcome page reaches no data-loading code", () => {
  const { reached, violations } = scanWelcomeRoute(REAL_SRC);
  assert.deepEqual(violations.map(formatViolation), []);
  // Not vacuous: the scan starts at the welcome page and follows it into the catalog.
  assert.ok(reached.includes("src/routes/+page.svelte"), reached.join("\n"));
  assert.ok(reached.includes("src/lib/config/catalog.js"), reached.join("\n"));
});

// Planted trees: each gets its own src/ in a temp dir.
const temp = mkdtempSync(join(tmpdir(), "welcome-"));
after(() => rmSync(temp, { recursive: true, force: true }));
let treeCount = 0;

/**
 * Write the files under a fresh `src/` and scan it.
 * @param {Record<string, string>} files - Path under src/ → source
 */
function scan(files) {
  const src = join(temp, String(treeCount++), "src");
  for (const [path, source] of Object.entries(files)) {
    const file = join(src, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, source);
  }
  return scanWelcomeRoute(src);
}

/** @param {string} code */
const svelte = (code) => `<script lang="ts">\n${code}\n</script>\n<p>petroviz</p>`;

/**
 * Assert exactly one violation, naming the file, the import and the chain
 * that reached it.
 * @param {ReturnType<typeof scan>} result
 * @param {{ file: string, specifier: string, via: string[] }} expected - Paths under src/
 */
function assertOneViolation({ violations }, { file, specifier, via }) {
  assert.equal(violations.length, 1, violations.map(formatViolation).join("\n"));
  const [violation] = violations;
  assert.equal(violation.file, `src/${file}`);
  assert.equal(violation.specifier, specifier);
  assert.deepEqual(violation.via, via.map((path) => `src/${path}`));
  const message = formatViolation(violation);
  assert.ok(message.startsWith(`src/${file} imports "${specifier}"`), message);
  assert.match(message, /the welcome page loads no data/);
  for (const path of via) assert.ok(message.includes(`src/${path}`), message);
}

test("the catalog module and presentation components are allowed", () => {
  const result = scan({
    "app.css": `body { margin: 0; }`,
    "routes/+layout.svelte": svelte(`import '../app.css';`),
    "routes/+layout.ts": `export const prerender = true;`,
    "routes/+page.svelte": svelte(`
      import { resolve } from '$app/paths';
      import AppHeader from '$lib/components/AppHeader.svelte';
      import { CATALOG } from '$lib/config/data-sources';
      import PlotSketch from './PlotSketch.svelte';`),
    "routes/PlotSketch.svelte": svelte(`import { onMount } from 'svelte';`),
    "lib/components/AppHeader.svelte": svelte(`
      import { page } from "$app/state";
      import ThemeToggle from "./ThemeToggle.svelte";`),
    "lib/components/ThemeToggle.svelte": svelte(`import { themeStore } from "$lib/stores/theme.svelte";`),
    "lib/stores/theme.svelte.ts": `export const themeStore = $state({ dark: false });`,
    "lib/config/data-sources.ts": `
      import * as staticEnv from "$env/static/public";
      import { resolveHosts } from "./sources.js";
      import { resolveCatalog } from "./catalog.js";`,
    "lib/config/sources.js": `export function resolveHosts() {}`,
    "lib/config/catalog.js": `import { resolveHosts } from "./sources.js";`,
  });
  assert.deepEqual(result.violations.map(formatViolation), []);
  assert.deepEqual(result.reached, [
    "src/lib/components/AppHeader.svelte",
    "src/lib/components/ThemeToggle.svelte",
    "src/lib/config/catalog.js",
    "src/lib/config/data-sources.ts",
    "src/lib/config/sources.js",
    "src/lib/stores/theme.svelte.ts",
    "src/routes/+layout.svelte",
    "src/routes/+layout.ts",
    "src/routes/+page.svelte",
    "src/routes/PlotSketch.svelte",
  ]);
});

test("the welcome page importing DuckDB directly is reported", () => {
  const result = scan({
    "routes/+page.svelte": svelte(`import * as duckdb from '@duckdb/duckdb-wasm';`),
  });
  assertOneViolation(result, {
    file: "routes/+page.svelte",
    specifier: "@duckdb/duckdb-wasm",
    via: ["routes/+page.svelte"],
  });
  assert.match(formatViolation(result.violations[0]), /DuckDB/);
});

test("the welcome page importing the data access directly is reported", () => {
  const result = scan({
    "routes/+page.svelte": svelte(`import { initializeDatabase } from '$lib/data/db';`),
    "lib/data/db.ts": `import * as duckdb from "@duckdb/duckdb-wasm";`,
  });
  // Reported where it crosses into the data access, not again inside it.
  assertOneViolation(result, {
    file: "routes/+page.svelte",
    specifier: "$lib/data/db",
    via: ["routes/+page.svelte"],
  });
});

test("an indirect import of the data store is reported at the file that imports it", () => {
  const result = scan({
    "routes/+page.svelte": svelte(`import Chart from '$lib/components/Chart.svelte';`),
    "lib/components/Chart.svelte": svelte(`import { dataStore } from "$lib/stores/data.svelte";`),
    "lib/stores/data.svelte.ts": `import { query } from "$lib/data/db";`,
    "lib/data/db.ts": ``,
  });
  assertOneViolation(result, {
    file: "lib/components/Chart.svelte",
    specifier: "$lib/stores/data.svelte",
    via: ["routes/+page.svelte", "lib/components/Chart.svelte"],
  });
});

test("an indirect import of DuckDB through relative paths is reported", () => {
  const result = scan({
    "routes/+page.svelte": svelte(`import PlotSketch from './PlotSketch.svelte';`),
    "routes/PlotSketch.svelte": svelte(`import { points } from '../lib/utils/sketch';`),
    "lib/utils/sketch.ts": `import { AsyncDuckDB } from "@duckdb/duckdb-wasm";`,
  });
  assertOneViolation(result, {
    file: "lib/utils/sketch.ts",
    specifier: "@duckdb/duckdb-wasm",
    via: ["routes/+page.svelte", "routes/PlotSketch.svelte", "lib/utils/sketch.ts"],
  });
});

test("the FORCE 2020 and LAS log adapters and their decoders are reported", () => {
  const result = scan({
    "routes/+page.svelte": svelte(`
      import { loadWell } from '$lib/sources/force2020';
      import { readLas } from '$lib/welllog/las';
      import { isWellId } from '../lib/sources/force2020/wellId.ts';
      import { parquetRead } from 'hyparquet';
      import { decompress } from 'fzstd';
      import { getSchemaUrl } from '$lib/data/schema';`),
    "lib/sources/force2020/index.ts": ``,
    "lib/sources/force2020/wellId.ts": ``,
    "lib/welllog/las/index.ts": ``,
  });
  assert.deepEqual(
    result.violations.map((v) => v.specifier),
    [
      "$lib/sources/force2020",
      "$lib/welllog/las",
      "../lib/sources/force2020/wellId.ts",
      "hyparquet",
      "fzstd",
      "$lib/data/schema",
    ],
  );
  const messages = result.violations.map(formatViolation);
  assert.match(messages[0], /FORCE 2020 log adapter/);
  assert.match(messages[1], /LAS log adapter/);
  // Data access that doesn't exist yet is still data access.
  assert.match(messages[5], /data access/);
});

test("the root layout and client hooks run on the welcome page, so they are scanned", () => {
  const result = scan({
    "routes/+page.svelte": svelte(``),
    "routes/+layout.svelte": svelte(`import { dataStore } from '$lib/stores/data.svelte';`),
    "lib/stores/data.svelte.ts": ``,
    "hooks.client.ts": `import { readLas } from "$lib/welllog/las";`,
    "lib/welllog/las/index.ts": ``,
  });
  assert.deepEqual(
    result.violations.map((v) => `${v.file} ${v.specifier}`),
    ["src/routes/+layout.svelte $lib/stores/data.svelte", "src/hooks.client.ts $lib/welllog/las"],
  );
});

test("files the welcome page doesn't reach are not its concern", () => {
  const result = scan({
    "routes/+page.svelte": svelte(`import AppHeader from '$lib/components/AppHeader.svelte';`),
    "lib/components/AppHeader.svelte": svelte(``),
    "routes/production/+page.svelte": svelte(`import { dataStore } from '$lib/stores/data.svelte';`),
    "routes/logs/+page.svelte": svelte(`import { readLas } from '$lib/welllog/las';`),
  });
  assert.deepEqual(result.violations.map(formatViolation), []);
  assert.deepEqual(result.reached, ["src/lib/components/AppHeader.svelte", "src/routes/+page.svelte"]);
});

test("dynamic, side-effect, re-export and multi-line imports are all followed", () => {
  const result = scan({
    "routes/+page.svelte": svelte(`
      import './a.ts';
      const b = await import('./b.ts');
      export { c } from './c.ts';
      import {\n  d,\n} from './d.ts';`),
    "routes/a.ts": `import "@duckdb/duckdb-wasm";`,
    "routes/b.ts": "const m = await import(`$lib/data/db`);",
    "routes/c.ts": `export * from "$lib/sources/force2020";`,
    "routes/d.ts": `import {\n  readLas,\n} from "$lib/welllog/las";`,
  });
  assert.deepEqual(
    result.violations.map((v) => `${v.file} ${v.specifier}`).sort(),
    [
      "src/routes/a.ts @duckdb/duckdb-wasm",
      "src/routes/b.ts $lib/data/db",
      "src/routes/c.ts $lib/sources/force2020",
      "src/routes/d.ts $lib/welllog/las",
    ],
  );
});

test("type-only imports load nothing and pass, but inline type imports still load the module", () => {
  const result = scan({
    "routes/+page.svelte": svelte(`
      import type { Well } from '$lib/data/schema';
      import type * as Duck from '@duckdb/duckdb-wasm';
      export type { ForceWell } from '$lib/sources/force2020';
      import { type WellLog } from '$lib/welllog/las';`),
  });
  // verbatimModuleSyntax keeps `import { type X } from "m"` as an import of m.
  assert.deepEqual(result.violations.map((v) => v.specifier), ["$lib/welllog/las"]);
});

test("imports in comments and markup are ignored", () => {
  const result = scan({
    "routes/+page.svelte": `<script>
      // import { query } from '$lib/data/db';
      /* import '@duckdb/duckdb-wasm'; */
    </script>
    <p>Loads no data, so it never does import "@duckdb/duckdb-wasm"</p>`,
  });
  assert.deepEqual(result.violations.map(formatViolation), []);
});

test("an import that doesn't resolve is reported, since what it loads can't be checked", () => {
  const result = scan({
    "routes/+page.svelte": svelte(`import { x } from '$lib/components/Missing.svelte';`),
  });
  assertOneViolation(result, {
    file: "routes/+page.svelte",
    specifier: "$lib/components/Missing.svelte",
    via: ["routes/+page.svelte"],
  });
  assert.match(formatViolation(result.violations[0]), /doesn't resolve/);
});

test("a cycle is followed once, and a file reached twice reports its import once", () => {
  const result = scan({
    "routes/+page.svelte": svelte(`
      import A from '$lib/components/A.svelte';
      import B from '$lib/components/B.svelte';`),
    "lib/components/A.svelte": svelte(`import B from './B.svelte';`),
    "lib/components/B.svelte": svelte(`
      import A from './A.svelte';
      import { db } from '../data/db.ts';`),
    "lib/data/db.ts": ``,
  });
  // B is reached first straight from the page, so that is the chain reported.
  assertOneViolation(result, {
    file: "lib/components/B.svelte",
    specifier: "../data/db.ts",
    via: ["routes/+page.svelte", "lib/components/B.svelte"],
  });
});
