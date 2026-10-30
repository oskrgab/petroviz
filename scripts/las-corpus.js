/**
 * LAS corpus run: the LAS log adapter's pipeline over real files (#32, #52).
 *
 * Opt in, outside `pnpm test`:
 *
 *   pnpm las-corpus                 # every corpus file
 *   pnpm las-corpus --only force    # just the FORCE 2020 exports
 *
 * It downloads into `.cache/las-corpus/` (git-ignored; a second run reads the
 * cache) and runs `lasToWellLog` and `checkWellLog` on each file:
 *
 * - the 118 FORCE 2020 LAS exports at commit c8d01ee (~618 MB, CC BY 4.0,
 *   Zenodo DOI 10.5281/zenodo.4351156);
 * - GLADE `west_mac60.las` (GDR 1857, CC BY 4.0), pulled out of a 402 MB zip
 *   with HTTP range requests, so only the one member is downloaded;
 * - Utah FORGE `Acord 1-26` (GDR 1111, CC BY 4.0), a wrapped file.
 *
 * It prints one line per file, then a summary of the load warnings: how many
 * files raised each code, and its total count. It exits non-zero when a file
 * throws or a well log breaks the contract. Set GITHUB_TOKEN if the GitHub API
 * rate limit gets in the way of listing the FORCE 2020 files.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";

import { checkWellLog, severityOf } from "../src/lib/welllog/core/index.ts";
import { lasToWellLog } from "../src/lib/welllog/las/index.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = join(ROOT, ".cache", "las-corpus");

const FORCE_REPO = "bolgebrygg/Force-2020-Machine-Learning-competition";
const FORCE_COMMIT = "c8d01ee92c1c8e1ecba36f96cca6ea7b689338a1";
const FORCE_DIR = "lithology_competition/data/las_files_Lithostrat_data";

const GLADE_ZIP = "https://gdr.openei.org/files/1857/Wireline%20Logs.zip";
const GLADE_MEMBER = "west_mac60.las";
const ACORD = "https://gdr.openei.org/files/1111/Acord%201-26_digitized_geophysical_well_log.las";

/**
 * @typedef {object} CorpusFile
 * @property {string} group
 * @property {string} name - The file name the well log is built with
 * @property {string} path - Where it is cached
 * @property {() => Promise<Uint8Array>} download
 */

/** @param {string} url @param {RequestInit} [init] */
async function fetchOk(url, init) {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response;
}

/** @param {string} url */
async function fetchBytes(url) {
  return new Uint8Array(await (await fetchOk(url)).arrayBuffer());
}

/** @param {string} url @param {number} start @param {number} end - inclusive */
async function fetchRange(url, start, end) {
  const response = await fetchOk(url, { headers: { Range: `bytes=${start}-${end}` } });
  if (response.status !== 206) throw new Error(`${url}: the server ignored a byte range request`);
  return Buffer.from(await response.arrayBuffer());
}

/**
 * One member of a remote zip, read with range requests: the end of central
 * directory record, the central directory, then the member's local header and
 * data. Handles stored and deflated members, without zip64.
 * @param {string} url
 * @param {string} suffix - The member whose name ends with this
 */
async function zipMember(url, suffix) {
  const size = Number((await fetchOk(url, { method: "HEAD" })).headers.get("content-length"));
  const tailLength = Math.min(size, 65557);
  const tail = await fetchRange(url, size - tailLength, size - 1);
  const eocd = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error(`${url}: no end of central directory`);
  const directorySize = tail.readUInt32LE(eocd + 12);
  const directoryOffset = tail.readUInt32LE(eocd + 16);
  if (directoryOffset === 0xffffffff) throw new Error(`${url}: zip64 isn't supported`);
  const directory = await fetchRange(url, directoryOffset, directoryOffset + directorySize - 1);

  for (let p = 0; p < directory.length && directory.readUInt32LE(p) === 0x02014b50; ) {
    const method = directory.readUInt16LE(p + 10);
    const compressedSize = directory.readUInt32LE(p + 20);
    const nameLength = directory.readUInt16LE(p + 28);
    const extraLength = directory.readUInt16LE(p + 30);
    const commentLength = directory.readUInt16LE(p + 32);
    const localOffset = directory.readUInt32LE(p + 42);
    const name = directory.toString("utf8", p + 46, p + 46 + nameLength);
    p += 46 + nameLength + extraLength + commentLength;
    if (!name.endsWith(suffix)) continue;

    const local = await fetchRange(url, localOffset, localOffset + 29);
    const dataStart = localOffset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28);
    const data = await fetchRange(url, dataStart, dataStart + compressedSize - 1);
    if (method === 0) return new Uint8Array(data);
    if (method === 8) return new Uint8Array(inflateRawSync(data));
    throw new Error(`${url}: ${name} uses compression method ${method}`);
  }
  throw new Error(`${url}: no member ending ${suffix}`);
}

/** @returns {Promise<CorpusFile[]>} */
async function forceFiles() {
  const listPath = join(CACHE, "force2020", "_list.json");
  /** @type {string[]} */
  let names;
  if (existsSync(listPath)) {
    names = JSON.parse(readFileSync(listPath, "utf8"));
  } else {
    const token = process.env.GITHUB_TOKEN;
    const response = await fetchOk(
      `https://api.github.com/repos/${FORCE_REPO}/contents/${FORCE_DIR}?ref=${FORCE_COMMIT}`,
      { headers: { Accept: "application/vnd.github+json", ...(token ? { Authorization: `Bearer ${token}` } : {}) } },
    );
    /** @type {{ name: string }[]} */
    const entries = await response.json();
    names = entries.map((e) => e.name).filter((name) => name.toLowerCase().endsWith(".las"));
    mkdirSync(dirname(listPath), { recursive: true });
    writeFileSync(listPath, JSON.stringify(names));
  }
  return names.map((name) => ({
    group: "force",
    name,
    path: join(CACHE, "force2020", name),
    download: () => fetchBytes(`https://raw.githubusercontent.com/${FORCE_REPO}/${FORCE_COMMIT}/${FORCE_DIR}/${name}`),
  }));
}

/** @returns {CorpusFile[]} */
function gdrFiles() {
  return [
    { group: "glade", name: GLADE_MEMBER, path: join(CACHE, "glade", GLADE_MEMBER), download: () => zipMember(GLADE_ZIP, GLADE_MEMBER) },
    { group: "forge", name: "Acord 1-26.las", path: join(CACHE, "forge", "Acord 1-26.las"), download: () => fetchBytes(ACORD) },
  ];
}

/** @param {CorpusFile} file */
async function cached(file) {
  if (existsSync(file.path)) return new Uint8Array(readFileSync(file.path));
  const bytes = await file.download();
  mkdirSync(dirname(file.path), { recursive: true });
  writeFileSync(file.path, bytes);
  return bytes;
}

/**
 * Runs `task` over `items`, `limit` at a time, keeping the results in order.
 * @template T, R
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T) => Promise<R>} task
 */
async function pool(items, limit, task) {
  /** @type {R[]} */
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await task(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function main() {
  const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : null;
  const files = [...(await forceFiles()), ...gdrFiles()].filter((f) => only === null || f.group === only);

  process.stdout.write(`Fetching ${files.length} files into ${CACHE}…\n`);
  const contents = await pool(files, 6, cached);

  /** @type {Map<import("../src/lib/welllog/core/index.ts").LoadWarningCode, { files: number, count: number }>} */
  const summary = new Map();
  /** @type {string[]} */
  const failures = [];
  let totalMs = 0;

  files.forEach((file, i) => {
    const bytes = contents[i];
    const label = `${file.group}/${file.name}`;
    try {
      const start = performance.now();
      const log = lasToWellLog(bytes, file.name);
      const ms = performance.now() - start;
      totalMs += ms;
      const violations = checkWellLog(log);
      if (violations.length > 0) failures.push(`${label}: ${violations.map((v) => v.message).join("; ")}`);

      const codes = new Set(log.warnings.map((w) => w.code));
      for (const warning of log.warnings) {
        const entry = summary.get(warning.code) ?? { files: 0, count: 0 };
        entry.count += warning.count ?? 1;
        summary.set(warning.code, entry);
      }
      for (const code of codes) {
        const entry = summary.get(code);
        if (entry) entry.files++;
      }
      const mb = (bytes.length / 1e6).toFixed(1);
      process.stdout.write(
        `${violations.length ? "✖" : "✔"} ${label}  ${mb} MB  ${log.md.length} rows × ${log.curves.length} curves  ${ms.toFixed(0)} ms  ${[...codes].join(" ")}\n`,
      );
    } catch (error) {
      failures.push(`${label}: ${/** @type {Error} */ (error).message}`);
      process.stdout.write(`✖ ${label}  threw: ${/** @type {Error} */ (error).message}\n`);
    }
  });

  process.stdout.write(`\n${files.length} files, ${files.length - failures.length} sound well logs, ${totalMs.toFixed(0)} ms in the pipeline.\n`);
  process.stdout.write("\nLoad warnings (code, severity, files, total count):\n");
  for (const [code, { files: inFiles, count }] of [...summary].sort((a, b) => b[1].files - a[1].files)) {
    process.stdout.write(`  ${code.padEnd(28)} ${severityOf(code).padEnd(8)} ${String(inFiles).padStart(4)} ${String(count).padStart(10)}\n`);
  }
  if (failures.length > 0) {
    process.stdout.write(`\nFailures:\n${failures.map((f) => `  ${f}`).join("\n")}\n`);
    process.exitCode = 1;
  }
}

await main();
