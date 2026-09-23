/**
 * Volve sources: the canonical URLs petroviz reads from.
 *
 * petrodb publishes a Dataset's parquet tables to the Data host (Hugging Face)
 * and its schema to the Schema host (the petrodb site). This module holds the
 * defaults for both and resolves them, plus any overrides, into the list of
 * sources the site fetches.
 *
 * Plain JavaScript with no SvelteKit imports, so both the app and a standalone
 * Node script can load it.
 */

/** @typedef {"parquet" | "schema"} SourceKind */

/**
 * @typedef {object} Source
 * @property {string} name - Table name, or "schema"
 * @property {SourceKind} kind
 * @property {string} url - Full URL
 */

/**
 * Optional overrides, keyed by their env var names. A missing or empty value
 * falls back to the default.
 *
 * @typedef {object} SourceSettings
 * @property {string} [PUBLIC_DATA_BASE_URL] - Data host base URL
 * @property {string} [PUBLIC_SCHEMA_BASE_URL] - Schema host base URL
 * @property {string} [PUBLIC_WELLS_PARQUET]
 * @property {string} [PUBLIC_DAILY_PRODUCTION_PARQUET]
 * @property {string} [PUBLIC_MONTHLY_PRODUCTION_PARQUET]
 * @property {string} [PUBLIC_SCHEMA_JSON]
 */

export const DEFAULTS = Object.freeze({
  PUBLIC_DATA_BASE_URL:
    "https://huggingface.co/datasets/sumpalabs/petrodb/resolve/main",
  PUBLIC_SCHEMA_BASE_URL: "https://petrodb.ocortez.com",
  PUBLIC_WELLS_PARQUET: "volve/wells.parquet",
  PUBLIC_DAILY_PRODUCTION_PARQUET: "volve/daily_production.parquet",
  PUBLIC_MONTHLY_PRODUCTION_PARQUET: "volve/monthly_production.parquet",
  PUBLIC_SCHEMA_JSON: "volve/schema.json",
});

/**
 * Join a base URL and a path. A path that is already an absolute URL
 * replaces the base.
 * @param {string} base
 * @param {string} path
 * @returns {string}
 */
function buildUrl(base, path) {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  const cleanPath = path.startsWith("/") ? path.slice(1) : path;
  return `${base}/${cleanPath}`;
}

/**
 * @param {SourceSettings} overrides
 * @param {keyof typeof DEFAULTS} key
 * @returns {string}
 */
function setting(overrides, key) {
  return overrides[key] || DEFAULTS[key];
}

/**
 * Resolve the Data host and Schema host base URLs, without trailing slashes.
 * @param {SourceSettings} [overrides]
 * @returns {{ dataHost: string, schemaHost: string }}
 */
export function resolveHosts(overrides = {}) {
  /** @param {string} url */
  const trim = (url) => (url.endsWith("/") ? url.slice(0, -1) : url);
  return {
    dataHost: trim(setting(overrides, "PUBLIC_DATA_BASE_URL")),
    schemaHost: trim(setting(overrides, "PUBLIC_SCHEMA_BASE_URL")),
  };
}

/**
 * Resolve defaults plus overrides into the list of sources the site fetches.
 * @param {SourceSettings} [overrides]
 * @returns {Source[]}
 */
export function resolveSources(overrides = {}) {
  /** @param {keyof typeof DEFAULTS} key */
  const get = (key) => setting(overrides, key);
  const { dataHost, schemaHost } = resolveHosts(overrides);

  return [
    {
      name: "wells",
      kind: "parquet",
      url: buildUrl(dataHost, get("PUBLIC_WELLS_PARQUET")),
    },
    {
      name: "daily_production",
      kind: "parquet",
      url: buildUrl(dataHost, get("PUBLIC_DAILY_PRODUCTION_PARQUET")),
    },
    {
      name: "monthly_production",
      kind: "parquet",
      url: buildUrl(dataHost, get("PUBLIC_MONTHLY_PRODUCTION_PARQUET")),
    },
    {
      name: "schema",
      kind: "schema",
      url: buildUrl(schemaHost, get("PUBLIC_SCHEMA_JSON")),
    },
  ];
}
