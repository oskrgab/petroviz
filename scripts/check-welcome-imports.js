/**
 * Welcome page import scanner
 *
 * The welcome page loads no data (CONTEXT.md). This follows its imports, from
 * the welcome route through every file they reach, and reports any that ends
 * in DuckDB, the production dashboard's data access, or a log adapter, so
 * that can't change by accident. `check-welcome-imports.test.js` runs it on
 * the real tree, which puts it in `pnpm test` and so in front of every deploy.
 *
 * It follows `$lib` and relative imports. Everything else is a package, which
 * passes unless it is forbidden below. Type-only imports load nothing, so they
 * are skipped. Specifiers are read by `imports.js`.
 */

import { readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

import { importSpecifiers, isPackage, SOURCE_FILE } from "./imports.js";

/**
 * @typedef {object} Violation
 * @property {string} file - The file with the import, relative to the project root
 * @property {string} specifier - The import as written
 * @property {string} reason
 * @property {string[]} via - The files from the welcome route down to `file`, inclusive
 */

/**
 * What runs when the welcome page opens, relative to `src/`: the root layout,
 * the page itself, and the client hooks. The first that exists of each wins.
 */
const ENTRIES = [
  ["routes/+layout.ts", "routes/+layout.js"],
  ["routes/+layout.svelte"],
  ["routes/+page.ts", "routes/+page.js"],
  ["routes/+page.svelte"],
  ["hooks.client.ts", "hooks.client.js"],
  ["hooks.ts", "hooks.js"],
];

/**
 * Packages that load data, with what they are.
 * @type {[string, string][]}
 */
const FORBIDDEN_PACKAGES = [
  ["@duckdb", "DuckDB"],
  ["hyparquet", "the Parquet reader the FORCE 2020 log adapter uses"],
  ["fzstd", "the Zstandard decoder the FORCE 2020 log adapter uses"],
];

/**
 * Files that load data, by their path under `src/` with or without its
 * extension, with what they are. The first match names it.
 * @type {[RegExp, string][]}
 */
const FORBIDDEN_FILES = [
  [/^lib\/data(?:\/|$)/, "the production dashboard's data access"],
  [/^lib\/stores\/data\.svelte(?:\.[jt]s)?$/, "the production dashboard's data store"],
  [/^lib\/sources\/force2020(?:\/|$)/, "the FORCE 2020 log adapter"],
  [/^lib\/sources(?:\/|$)/, "a petrodb dataset's log adapter"],
  [/^lib\/welllog\/las(?:\/|$)/, "the LAS log adapter"],
];

// How SvelteKit and Vite complete an import written without its file.
const COMPLETIONS = ["", ".ts", ".js", "/index.ts", "/index.js"];

/** @param {string} what - What the import is */
function offLimitsReason(what) {
  return `it is ${what}, and the welcome page loads no data`;
}

/** @param {string} path */
function isFile(path) {
  return statSync(path, { throwIfNoEntry: false })?.isFile() ?? false;
}

/**
 * @param {string} from
 * @param {string} to
 */
function posixRelative(from, to) {
  return relative(from, to).split(sep).join("/");
}

/**
 * The path a `$lib` or relative import names, before completion, or undefined
 * for a package.
 * @param {string} srcDir
 * @param {string} file
 * @param {string} specifier
 */
function importedPath(srcDir, file, specifier) {
  if (isPackage(specifier, "$lib")) return join(srcDir, "lib", specifier.slice("$lib".length));
  if (specifier.startsWith(".")) return resolve(dirname(file), specifier);
  return undefined;
}

/**
 * Follow the welcome route's imports through `srcDir`.
 * @param {string} srcDir - Absolute path of `src`
 * @returns {{ reached: string[], violations: Violation[] }} `reached` lists every
 *   source file followed, sorted; paths are relative to the project root
 */
export function scanWelcomeRoute(srcDir) {
  const root = dirname(srcDir);
  const fromRoot = (/** @type {string} */ path) => posixRelative(root, path);

  /** @type {Violation[]} */
  const violations = [];
  /** @type {Set<string>} */
  const seen = new Set();
  /** @type {{ file: string, via: string[] }[]} */
  const queue = [];

  /**
   * @param {string} file
   * @param {string[]} via - The chain that reached the file's importer
   */
  const visit = (file, via) => {
    if (seen.has(file)) return;
    seen.add(file);
    queue.push({ file, via: [...via, fromRoot(file)] });
  };

  for (const candidates of ENTRIES) {
    const entry = candidates.map((path) => join(srcDir, path)).find(isFile);
    if (entry) visit(entry, []);
  }

  // Breadth first, so each file's chain is the shortest way to it.
  for (let next = queue.shift(); next; next = queue.shift()) {
    const { file, via } = next;
    const source = readFileSync(file, "utf8");
    for (const specifier of importSpecifiers(file, source, { runtimeOnly: true })) {
      const report = (/** @type {string} */ reason) =>
        violations.push({ file: fromRoot(file), specifier, reason, via });

      const path = importedPath(srcDir, file, specifier);
      if (path === undefined) {
        const forbidden = FORBIDDEN_PACKAGES.find(([name]) => isPackage(specifier, name));
        if (forbidden) report(offLimitsReason(forbidden[1]));
        continue;
      }

      const target = COMPLETIONS.map((completion) => path + completion).find(isFile);
      const underSrc = posixRelative(srcDir, target ?? path);
      // Data-loading code is known by where it sits, so an import of it that doesn't resolve is still named.
      const forbidden = FORBIDDEN_FILES.find(([pattern]) => pattern.test(underSrc));
      if (forbidden) report(offLimitsReason(forbidden[1]));
      else if (target === undefined) {
        report("it doesn't resolve to a file, so this can't check that the welcome page loads no data");
      }
      // Anything else that resolves, such as a stylesheet, imports nothing to follow.
      else if (SOURCE_FILE.test(target)) visit(target, via);
    }
  }

  return { reached: [...seen].map(fromRoot).sort(), violations };
}

/** @param {Violation} violation */
export function formatViolation({ file, specifier, reason, via }) {
  const chain = via.length > 1 ? ` (reached by ${via.join(" → ")})` : "";
  return `${file} imports "${specifier}": ${reason}${chain}`;
}
