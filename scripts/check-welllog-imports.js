/**
 * Well log import-boundary scanner
 *
 * Checks every import under `src/lib/welllog/` against ADR-0004's layer table,
 * so the module never comes to depend on petrodb, DuckDB, FORCE 2020 or
 * SvelteKit. `check-welllog-imports.test.js` runs it on the real tree, which
 * puts it in `pnpm test` and so in front of every deploy.
 *
 * Specifiers are read by `imports.js`, shared with the welcome page's scanner.
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

import { importSpecifiers, isPackage, SOURCE_FILE } from "./imports.js";

/**
 * @typedef {object} Violation
 * @property {string} file - Path of the offending file, relative to the working directory
 * @property {string} [specifier] - The import as written; absent when the file itself is misplaced
 * @property {string} reason
 */

/** @typedef {"core" | "view" | "las"} Layer */

/**
 * ADR-0004: what each layer may import besides itself. A package entry also
 * allows its subpaths (`svelte` allows `svelte/store`).
 * @type {Record<Layer, { layers: Layer[], packages: string[] }>}
 */
const LAYERS = {
  core: { layers: [], packages: [] },
  view: { layers: ["core"], packages: ["svelte"] },
  las: { layers: ["core"], packages: [] },
};

/**
 * Imports that are off limits in every layer, with why. Checked first so the
 * failure says why, not just that the layer doesn't list it.
 * @type {[(specifier: string) => boolean, string][]}
 */
const FORBIDDEN = [
  [(s) => isPackage(s, "$app"), "SvelteKit's $app/* is off limits under welllog/"],
  // ADR-0004: relative paths with the .ts extension, so node --test can run them.
  [(s) => isPackage(s, "$lib"), "welllog/ imports by relative path, never through $lib"],
  [(s) => isPackage(s, "@duckdb"), "DuckDB is off limits under welllog/"],
  [(s) => isPackage(s, "hyparquet"), "hyparquet belongs to the FORCE 2020 log adapter, outside welllog/"],
];

const TEST_FILE = /\.test\.[cm]?[jt]s$/;

/** @param {string} key */
function isLayer(key) {
  return Object.hasOwn(LAYERS, key);
}

/** @param {string} dir */
function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && SOURCE_FILE.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
}

/**
 * The layer a path under welllog/ sits in, or undefined when it is outside
 * welllog/ or outside every layer.
 * @param {string} welllogDir
 * @param {string} path - Absolute
 * @returns {Layer | undefined}
 */
function layerOf(welllogDir, path) {
  const [first, ...rest] = relative(welllogDir, path).split(sep);
  return rest.length > 0 && isLayer(first) ? /** @type {Layer} */ (first) : undefined;
}

/**
 * Why `specifier`, imported from `file` in `layer`, breaks the table, or
 * undefined when it doesn't.
 * @param {string} welllogDir
 * @param {string} file
 * @param {Layer} layer
 * @param {string} specifier
 */
function checkImport(welllogDir, file, layer, specifier) {
  for (const [matches, reason] of FORBIDDEN) {
    if (matches(specifier)) return reason;
  }
  const { layers, packages } = LAYERS[layer];

  if (!specifier.startsWith(".")) {
    if (packages.some((name) => isPackage(specifier, name))) return undefined;
    // Tests need node:test and node:assert; they never ship in the bundle.
    if (TEST_FILE.test(file) && specifier.startsWith("node:")) return undefined;
    const allowed = packages.length > 0 ? packages.join(", ") : "no packages";
    return `${layer} may import ${allowed}`;
  }

  const target = resolve(dirname(file), specifier);
  if (relative(welllogDir, target).startsWith("..")) return "reaches outside welllog/";
  const targetLayer = layerOf(welllogDir, target);
  if (targetLayer === layer || (targetLayer && layers.includes(targetLayer))) return undefined;
  return `${layer} may import only from ${[layer, ...layers].join(" and ")}`;
}

/**
 * Every import under `welllogDir` that ADR-0004's layer table forbids, and
 * every file that sits outside the table's layers.
 * @param {string} welllogDir - Absolute path of `src/lib/welllog`
 * @returns {Violation[]}
 */
export function findImportViolations(welllogDir) {
  /** @type {Violation[]} */
  const violations = [];
  for (const file of sourceFiles(welllogDir)) {
    const displayPath = relative(process.cwd(), file);
    const layer = layerOf(welllogDir, file);
    if (layer === undefined) {
      const reason = `is outside ${Object.keys(LAYERS).join(", ").replace(/, (?=[^,]*$)/, " and ")}`;
      violations.push({ file: displayPath, reason });
      continue;
    }
    for (const specifier of importSpecifiers(file, readFileSync(file, "utf8"))) {
      const reason = checkImport(welllogDir, file, layer, specifier);
      if (reason) violations.push({ file: displayPath, specifier, reason });
    }
  }
  return violations;
}

/** @param {Violation} violation */
export function formatViolation({ file, specifier, reason }) {
  return specifier === undefined ? `${file} ${reason}` : `${file} imports "${specifier}": ${reason}`;
}
