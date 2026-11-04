/**
 * Import specifier reader
 *
 * Shared by the import scanners (`check-welllog-imports.js`,
 * `check-welcome-imports.js`).
 *
 * It reads specifiers with regular expressions over comment-free code rather
 * than a parser, which is enough for petroviz's own code and keeps the
 * scanners dependency-free.
 */

export const SOURCE_FILE = /\.(?:[cm]?[jt]s|svelte)$/;

const SVELTE_SCRIPT = /<script\b[^>]*>([\s\S]*?)<\/script>/g;

// `from "x"` covers static imports and re-exports, however many lines they span.
const IMPORT_PATTERNS = [
  /\bfrom\s*(["'])([^"'\n]+)\1/g,
  /\bimport\s*(["'])([^"'\n]+)\1/g,
  // A `${…}` interpolation makes the specifier unknowable, but `$lib` is fine.
  /\bimport\s*\(\s*(["'`])((?:[^"'`$\n]|\$(?!\{))+)\1\s*\)/g,
];

// `import type … from "x"` and `export type … from "x"`, which TypeScript
// erases. `import { type A } from "x"` is not one: under verbatimModuleSyntax
// it still loads x.
const TYPE_ONLY_IMPORT =
  /\b(?:import|export)\s+type\s+(?:\*\s*as\s+[\w$]+|[\w$]+|\{[^}]*\})\s*from\s*(["'])[^"'\n]+\1/g;

/**
 * @param {string} specifier
 * @param {string} name
 */
export function isPackage(specifier, name) {
  return specifier === name || specifier.startsWith(`${name}/`);
}

/**
 * Drop comments, keeping strings whole, so neither a commented-out import nor
 * a `/*` inside a string can change what is read.
 * @param {string} source
 */
function stripComments(source) {
  let code = "";
  let i = 0;
  while (i < source.length) {
    const char = source[i];
    if (char === '"' || char === "'" || char === "`") {
      let end = i + 1;
      while (end < source.length && source[end] !== char) end += source[end] === "\\" ? 2 : 1;
      code += source.slice(i, end + 1);
      i = end + 1;
    } else if (source.startsWith("//", i)) {
      const end = source.indexOf("\n", i);
      i = end === -1 ? source.length : end;
    } else if (source.startsWith("/*", i)) {
      const end = source.indexOf("*/", i + 2);
      i = end === -1 ? source.length : end + 2;
      code += " ";
    } else {
      code += char;
      i++;
    }
  }
  return code;
}

/**
 * The specifiers `file` imports, in source order.
 * @param {string} file - Its path; a `.svelte` file is read for its <script> blocks only
 * @param {string} source
 * @param {{ runtimeOnly?: boolean }} [options] - Leave out type-only imports, which load nothing
 */
export function importSpecifiers(file, source, { runtimeOnly = false } = {}) {
  // Only a component's <script> blocks import anything; its markup is text.
  const script = file.endsWith(".svelte")
    ? [...source.matchAll(SVELTE_SCRIPT)].map((m) => m[1]).join("\n")
    : source;
  let code = stripComments(script);
  if (runtimeOnly) code = code.replace(TYPE_ONLY_IMPORT, " ");
  return IMPORT_PATTERNS.flatMap((pattern) => [...code.matchAll(pattern)])
    .sort((a, b) => /** @type {number} */ (a.index) - /** @type {number} */ (b.index))
    .map((m) => m[2]);
}
