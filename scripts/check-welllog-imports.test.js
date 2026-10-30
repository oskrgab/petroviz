import { after, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { findImportViolations, formatViolation } from "./check-welllog-imports.js";

const REAL_WELLLOG = fileURLToPath(new URL("../src/lib/welllog", import.meta.url));

test("every import under src/lib/welllog follows ADR-0004's layer table", (t) => {
  if (!existsSync(REAL_WELLLOG)) {
    t.skip("src/lib/welllog does not exist yet");
    return;
  }
  assert.deepEqual(findImportViolations(REAL_WELLLOG).map(formatViolation), []);
});

// Planted trees: each gets its own src/lib/welllog in a temp dir.
const temp = mkdtempSync(join(tmpdir(), "boundary-"));
after(() => rmSync(temp, { recursive: true, force: true }));
let treeCount = 0;
const WELLLOG_SEGMENT = join("src", "lib", "welllog") + sep;

/**
 * Write the files under a fresh `src/lib/welllog` and scan it.
 * @param {Record<string, string>} files - Path under welllog/ → source
 */
function scan(files) {
  const welllog = join(temp, String(treeCount++), "src", "lib", "welllog");
  for (const [path, source] of Object.entries(files)) {
    const file = join(welllog, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, source);
  }
  return findImportViolations(welllog);
}

/**
 * Assert exactly one violation, naming the file and the import.
 * @param {ReturnType<typeof scan>} violations
 * @param {string} file - Path under welllog/
 * @param {string} specifier
 */
function assertOneViolation(violations, file, specifier) {
  assert.equal(violations.length, 1, violations.map(formatViolation).join("\n"));
  const [violation] = violations;
  assert.ok(violation.file.endsWith(join("welllog", file)), violation.file);
  assert.equal(violation.specifier, specifier);
  const message = formatViolation(violation);
  assert.ok(message.includes(join("welllog", file)), message);
  assert.ok(message.includes(`"${specifier}"`), message);
}

test("imports the table allows pass", () => {
  const violations = scan({
    "core/well-log.ts": `export type WellLog = { md: Float64Array };`,
    "core/depth.ts": `import type { WellLog } from "./well-log.ts";`,
    "view/geometry.ts": `import { indexAtDepth } from "../core/depth.ts";`,
    "view/LogView.svelte": `<script lang="ts">
      import { onMount } from "svelte";
      import { writable } from "svelte/store";
      import { x } from "./geometry.ts";
    </script>
    <p>Loaded from "FORCE 2020"</p>
    <!-- import { goto } from "$app/navigation"; -->`,
    "las/parse.ts": `export * from "../core/well-log.ts";`,
  });
  assert.deepEqual(violations.map(formatViolation), []);
});

test("core importing view fails", () => {
  const violations = scan({
    "core/depth.ts": `import { draw } from "../view/draw.ts";`,
    "view/draw.ts": ``,
  });
  assertOneViolation(violations, "core/depth.ts", "../view/draw.ts");
});

test("core importing a package fails", () => {
  const violations = scan({ "core/depth.ts": `import { x } from "svelte";` });
  assertOneViolation(violations, "core/depth.ts", "svelte");
});

test("view importing $app/navigation fails", () => {
  const violations = scan({
    "view/LogView.svelte": `<script>import { goto } from "$app/navigation";</script>`,
  });
  assertOneViolation(violations, "view/LogView.svelte", "$app/navigation");
});

test("view importing $lib outside welllog/ fails", () => {
  const violations = scan({ "view/theme.ts": `import { theme } from "$lib/stores/theme.svelte";` });
  assertOneViolation(violations, "view/theme.ts", "$lib/stores/theme.svelte");
});

test("view importing @duckdb/* fails", () => {
  const violations = scan({ "view/db.ts": `import * as duckdb from "@duckdb/duckdb-wasm";` });
  assertOneViolation(violations, "view/db.ts", "@duckdb/duckdb-wasm");
});

test("las importing view fails", () => {
  const violations = scan({
    "las/build.ts": `import { defaultTemplate } from "../view/default-template.ts";`,
  });
  assertOneViolation(violations, "las/build.ts", "../view/default-template.ts");
});

test("importing through $lib fails, even inside welllog/", () => {
  const violations = scan({ "view/geometry.ts": `import { x } from "$lib/welllog/core/depth.ts";` });
  assertOneViolation(violations, "view/geometry.ts", "$lib/welllog/core/depth.ts");
});

test("hyparquet imported anywhere under welllog/ fails", () => {
  for (const layer of ["core", "view", "las"]) {
    const violations = scan({ [`${layer}/read.ts`]: `import { parquetRead } from "hyparquet";` });
    assertOneViolation(violations, `${layer}/read.ts`, "hyparquet");
  }
});

test("a relative import that leaves welllog/ fails", () => {
  const violations = scan({ "view/x.ts": `import { sources } from "../../config/sources.js";` });
  assertOneViolation(violations, "view/x.ts", "../../config/sources.js");
});

test("a file outside the three layers fails, with or without imports", () => {
  const violations = scan({
    "index.ts": `export * from "./core/well-log.ts";`,
    "util/x.ts": `export const x = 1;`,
  });
  assert.deepEqual(
    violations.map((v) => v.file.split(WELLLOG_SEGMENT)[1]),
    ["index.ts", join("util", "x.ts")],
  );
  assert.match(formatViolation(violations[0]), /index\.ts is outside core, view and las/);
});

test("side-effect, re-export, dynamic and multi-line imports are all checked", () => {
  const violations = scan({
    "core/a.ts": `import "svelte";`,
    "core/b.ts": `export { x } from "../view/x.ts";`,
    "core/c.ts": `const m = await import("../las/parse.ts");`,
    "core/d.ts": `import {\n  a,\n  b,\n} from "hyparquet";`,
    "core/e.ts": "const n = await import(`@duckdb/duckdb-wasm`);",
  });
  assert.deepEqual(
    violations.map((v) => v.specifier).sort(),
    ["../las/parse.ts", "../view/x.ts", "@duckdb/duckdb-wasm", "hyparquet", "svelte"],
  );
});

test("imports in comments are ignored", () => {
  const violations = scan({
    "core/a.ts": `// import { goto } from "$app/navigation";\n/* import "svelte"; */\nconst url = "https://example.com";`,
  });
  assert.deepEqual(violations.map(formatViolation), []);
});

test("comment markers inside strings hide no import", () => {
  const violations = scan({
    "las/a.ts": `const glob = "logs/*.las";\nimport { p } from "hyparquet";\n/* note */`,
    "las/b.ts": `const path = "a//b"; import "svelte";`,
    "las/c.ts": "const t = `/*`;\nimport { q } from \"@duckdb/duckdb-wasm\";\nconst u = `*/`;",
  });
  assert.deepEqual(
    violations.map((v) => v.specifier).sort(),
    ["@duckdb/duckdb-wasm", "hyparquet", "svelte"],
  );
});

test("a test file may import node:* builtins, and nothing else extra", () => {
  const violations = scan({
    "core/depth.test.ts": `import { test } from "node:test";\nimport assert from "node:assert/strict";\nimport { indexAtDepth } from "./depth.ts";`,
    "core/depth.ts": `import { readFileSync } from "node:fs";`,
    "las/parse.test.ts": `import { goto } from "$app/navigation";`,
  });
  assert.deepEqual(
    violations.map((v) => `${v.file.split(WELLLOG_SEGMENT)[1]} ${v.specifier}`).sort(),
    [`${join("core", "depth.ts")} node:fs`, `${join("las", "parse.test.ts")} $app/navigation`],
  );
});
