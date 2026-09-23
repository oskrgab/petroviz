/**
 * Data-source check
 *
 * Fetches every source in the resolved source list and checks it returns the
 * right kind of content: a parquet table must start with the `PAR1` marker,
 * the schema must parse as JSON and have a `tables` object. This catches the
 * Schema host answering a `.parquet` path with its landing page and a 200.
 *
 * Run it with the `check:sources` package script. It resolves the same PUBLIC_* overrides the
 * build does (from the environment, then .env), prints one line per source
 * and exits non-zero if any fails.
 *
 * Standalone Node 20 script with no dependencies.
 */

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolveSources } from "../src/lib/config/sources.js";

/** @typedef {import("../src/lib/config/sources.js").Source} Source */

/**
 * @typedef {object} CheckResult
 * @property {Source} source
 * @property {boolean} ok
 * @property {string} [reason] - Why the source failed
 */

const PARQUET_MAGIC = "PAR1";
// Enough for the parquet marker and a readable start of whatever came back.
const PREVIEW_BYTES = 64;
const REASON_PREVIEW_CHARS = 40;
const DEFAULT_TIMEOUT_MS = 30_000;

/** @param {Uint8Array} bytes */
const text = (bytes) => new TextDecoder().decode(bytes);

/**
 * Read up to `limit` bytes from the start of a response body, then stop.
 * @param {Response} response
 * @param {number} limit
 * @returns {Promise<Uint8Array>}
 */
async function readStart(response, limit) {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const start = new Uint8Array(limit);
  let length = 0;
  while (length < limit) {
    const { done, value } = await reader.read();
    if (done) break;
    const take = value.subarray(0, limit - length);
    start.set(take, length);
    length += take.length;
  }
  await reader.cancel();
  return start.subarray(0, length);
}

/**
 * How each kind of source is read and judged. `problem` says what is wrong
 * with the body, if anything.
 * @type {Record<Source["kind"], {
 *   read: (response: Response) => Promise<Uint8Array>,
 *   problem: (bytes: Uint8Array) => string | undefined,
 * }>}
 */
const CHECKS = {
  parquet: {
    // A parquet table only needs its first bytes; don't download the file.
    read: (response) => readStart(response, PREVIEW_BYTES),
    problem: (bytes) =>
      text(bytes.subarray(0, PARQUET_MAGIC.length)) === PARQUET_MAGIC
        ? undefined
        : "not parquet",
  },
  schema: {
    read: async (response) => new Uint8Array(await response.arrayBuffer()),
    problem: (bytes) => {
      let schema;
      try {
        schema = JSON.parse(text(bytes));
      } catch {
        return "not JSON";
      }
      const tables = schema?.tables;
      return tables && typeof tables === "object" && !Array.isArray(tables)
        ? undefined
        : "no tables object";
    },
  },
};

/**
 * Summarise what came back, for a failure reason.
 * @param {Response} response
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function describeResponse(response, bytes) {
  const type = response.headers.get("content-type") ?? "no content type";
  const start = text(bytes.subarray(0, REASON_PREVIEW_CHARS)).replace(/\s+/g, " ");
  return `HTTP ${response.status}, ${type}, starts ${JSON.stringify(start)}`;
}

/**
 * @param {Source} source
 * @param {number} timeoutMs
 * @returns {Promise<CheckResult>}
 */
async function checkSource(source, timeoutMs) {
  const check = CHECKS[source.kind];
  try {
    // One signal bounds both the request and reading the body.
    const response = await fetch(source.url, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    const bytes = response.ok
      ? await check.read(response)
      : await readStart(response, PREVIEW_BYTES);
    const problem = response.ok ? check.problem(bytes) : "bad status";
    if (problem) {
      return {
        source,
        ok: false,
        reason: `${problem}: ${describeResponse(response, bytes)}`,
      };
    }
    return { source, ok: true };
  } catch (error) {
    return { source, ok: false, reason: `request failed: ${errorText(error)}` };
  }
}

/**
 * @param {unknown} error
 * @returns {string}
 */
function errorText(error) {
  if (!(error instanceof Error)) return String(error);
  // fetch wraps the network error (DNS, refused, TLS) in `cause`
  const { cause } = error;
  return cause instanceof Error ? `${error.message} (${cause.message})` : error.message;
}

/**
 * Check each source. Never rejects: every failure, including a timeout or a
 * dropped connection, comes back as a failed result with a reason.
 * @param {Source[]} sources
 * @param {{ timeoutMs?: number }} [options]
 * @returns {Promise<CheckResult[]>}
 */
export function checkSources(sources, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  return Promise.all(sources.map((source) => checkSource(source, timeoutMs)));
}

/**
 * Print one line per source and return how many failed.
 * @param {CheckResult[]} results
 * @returns {number}
 */
function report(results) {
  for (const { source, ok, reason } of results) {
    const line = `${ok ? "PASS" : "FAIL"}  ${source.name.padEnd(18)} ${source.url}`;
    console.log(ok ? line : `${line}\n      ${reason}`);
  }
  return results.filter((result) => !result.ok).length;
}

async function main() {
  // Same precedence as the Vite build: the environment wins over .env.
  const envFile = fileURLToPath(new URL("../.env", import.meta.url));
  if (existsSync(envFile)) process.loadEnvFile(envFile);

  const failures = report(await checkSources(resolveSources(process.env)));
  if (failures > 0) {
    console.error(`\n${failures} source(s) failed.`);
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
