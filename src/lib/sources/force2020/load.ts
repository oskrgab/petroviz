/**
 * The FORCE 2020 log adapter's thin fetch and cache wrapper around
 * `decode` and `build`. Not unit-tested, by decision (#38); checked in the
 * running app.
 *
 * - One whole-file GET per well: no HEAD, no byte ranges.
 * - The bytes are kept in the Cache API, because the Data host's signed
 *   redirect defeats the HTTP cache. Entries are keyed on the dataset's
 *   commit (`X-Repo-Commit`), so a new petrodb commit is fetched afresh.
 *   Only `_files.json`'s final response carries that header (the parquet
 *   files redirect to a CDN that drops it), so the commit is read from there,
 *   once per page.
 * - Units and lithology labels come from the dataset's `schema.json` on the
 *   Schema host, also read once per page.
 */

import type { WellLog } from "../../welllog/core/index.ts";
import { build } from "./build.ts";
import { decode } from "./decode.ts";
import { isWellId } from "./wellId.ts";

export interface ForceHosts {
  /** Data host base URL, without a trailing slash. */
  readonly dataHost: string;
  /** Schema host base URL, without a trailing slash. */
  readonly schemaHost: string;
}

export interface LoadWellOptions extends ForceHosts {
  readonly signal?: AbortSignal;
}

/** Why a well didn't load: `unknown-well` and `network` read differently in the host. */
export type ForceLoadErrorKind = "unknown-well" | "network" | "data";

export class ForceLoadError extends Error {
  readonly kind: ForceLoadErrorKind;

  constructor(kind: ForceLoadErrorKind, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ForceLoadError";
    this.kind = kind;
  }
}

interface ForceSchema {
  tables: { wells: { columns: { name: string; unit: string | null }[] } };
  lithology_labels?: Record<string, string>;
}

interface SchemaInfo {
  units: Record<string, string | null>;
  lithologyLabels: Record<string, string>;
}

const CACHE_NAME = "petroviz-force2020-wells";
const COMMIT_PARAM = "petroviz-commit";

const wellsUrl = (hosts: ForceHosts) => `${hosts.dataHost}/force_2020/wells`;

/** Once per page and host, retried after a failure. */
function memo<T>(load: (hosts: ForceHosts) => Promise<T>): (hosts: ForceHosts) => Promise<T> {
  const results = new Map<string, Promise<T>>();
  return (hosts) => {
    const key = `${hosts.dataHost} ${hosts.schemaHost}`;
    let result = results.get(key);
    if (!result) {
      result = load(hosts);
      results.set(key, result);
      result.catch(() => results.delete(key));
    }
    return result;
  };
}

async function get(url: string, what: string, signal?: AbortSignal): Promise<Response> {
  try {
    return await fetch(url, { signal });
  } catch (cause) {
    signal?.throwIfAborted();
    throw new ForceLoadError("network", `Couldn't reach the server for ${what}. Check your connection.`, { cause });
  }
}

const schemaInfo = memo(async (hosts): Promise<SchemaInfo> => {
  const response = await get(`${hosts.schemaHost}/force_2020/schema.json`, "the FORCE 2020 schema");
  if (!response.ok) {
    throw new ForceLoadError("data", `The FORCE 2020 schema couldn't be read (HTTP ${response.status}).`);
  }
  const schema = (await response.json()) as ForceSchema;
  const units: Record<string, string | null> = {};
  for (const column of schema.tables?.wells?.columns ?? []) units[column.name] = column.unit;
  return { units, lithologyLabels: schema.lithology_labels ?? {} };
});

/**
 * The dataset commit the Data host serves now. Shared by every load, so it
 * is never aborted, and it throws when the host can't say, so the next load
 * asks again.
 */
const currentCommit = memo(async (hosts): Promise<string> => {
  const response = await fetch(`${wellsUrl(hosts)}/_files.json`);
  const commit = response.ok ? response.headers.get("X-Repo-Commit") : null;
  if (!commit) throw new Error(`The Data host gave no commit (HTTP ${response.status})`);
  return commit;
});

async function openCache(): Promise<Cache | null> {
  try {
    return await caches.open(CACHE_NAME);
  } catch {
    // No Cache API (an insecure origin, or storage refused): fetch every time.
    return null;
  }
}

function cacheKey(url: string, commit: string): string {
  return `${url}?${COMMIT_PARAM}=${encodeURIComponent(commit)}`;
}

/** Every cached copy of `url`, whatever its commit. */
async function cachedCopies(cache: Cache, url: string): Promise<readonly Request[]> {
  return (await cache.keys()).filter((request) => request.url.split("?")[0] === url);
}

async function download(url: string, id: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  const response = await get(url, `well ${id}`, signal);
  if (response.status === 404) {
    throw new ForceLoadError("unknown-well", `No FORCE 2020 well named ${id}.`);
  }
  if (!response.ok) {
    // Worth retrying, like a dropped connection.
    throw new ForceLoadError("network", `The server couldn't send well ${id} (HTTP ${response.status}).`);
  }
  return response.arrayBuffer();
}

/** Keep `bytes` as this well's only copy, once the commit they belong to is known. */
async function store(cache: Cache, url: string, bytes: ArrayBuffer, commit: Promise<string | null>): Promise<void> {
  const current = await commit;
  if (current === null) return;
  const stale = await cachedCopies(cache, url);
  await Promise.all(stale.map((request) => cache.delete(request)));
  await cache.put(cacheKey(url, current), new Response(bytes));
}

/**
 * The well's bytes. A cached copy is used when it is from the current
 * commit, or when the commit can't be learned (offline). With no usable
 * copy the download starts at once, without waiting for the commit.
 */
async function wellBytes(url: string, id: string, hosts: ForceHosts, signal?: AbortSignal): Promise<ArrayBuffer> {
  const commit = currentCommit(hosts).catch(() => null);
  const cache = await openCache();
  const copies = cache ? await cachedCopies(cache, url) : [];

  if (cache && copies.length > 0) {
    const current = await commit;
    const key = current === null ? copies[0] : copies.find((request) => request.url === cacheKey(url, current));
    const hit = key && (await cache.match(key));
    if (hit) return hit.arrayBuffer();
  }

  const bytes = await download(url, id, signal);
  if (cache) store(cache, url, bytes.slice(0), commit).catch(() => {});
  return bytes;
}

/**
 * Load one FORCE 2020 well by its file stem. Rejects with a ForceLoadError,
 * or with `signal.reason` once aborted.
 */
export async function loadWell(id: string, options: LoadWellOptions): Promise<WellLog> {
  const { signal, ...hosts } = options;
  signal?.throwIfAborted();
  if (!isWellId(id)) {
    throw new ForceLoadError("unknown-well", `No FORCE 2020 well named ${id}.`);
  }
  const url = `${wellsUrl(hosts)}/${id}.parquet`;

  const [bytes, schema] = await Promise.all([wellBytes(url, id, hosts, signal), schemaInfo(hosts)]);
  signal?.throwIfAborted();

  let columns;
  try {
    columns = await decode(bytes);
  } catch (cause) {
    throw new ForceLoadError("data", `Well ${id} couldn't be read: its file is damaged.`, { cause });
  }
  signal?.throwIfAborted();
  return build(columns, { id, ...schema });
}
