/**
 * Data Sources Configuration
 *
 * The app's view of the Volve sources. The canonical URLs and the rules for
 * resolving them live in ./sources.js; this module feeds it the PUBLIC_*
 * overrides.
 *
 * Overrides are read through SvelteKit's static public env, so they are
 * inlined at build time: set them in .env before `pnpm build`. A missing or
 * empty value falls back to the default.
 */

import * as staticEnv from "$env/static/public";
import { browser } from "$app/environment";
import {
  resolveHosts,
  resolveSources,
  type Source,
  type SourceSettings,
} from "./sources.js";

// Only variables set at build time exist on the module, so read it as a loose
// record instead of importing each name (a missing named import fails the build).
const env: Record<string, string | undefined> = staticEnv;

const SETTINGS: SourceSettings = {
  PUBLIC_DATA_BASE_URL: env.PUBLIC_DATA_BASE_URL,
  PUBLIC_SCHEMA_BASE_URL: env.PUBLIC_SCHEMA_BASE_URL,
  PUBLIC_WELLS_PARQUET: env.PUBLIC_WELLS_PARQUET,
  PUBLIC_DAILY_PRODUCTION_PARQUET: env.PUBLIC_DAILY_PRODUCTION_PARQUET,
  PUBLIC_MONTHLY_PRODUCTION_PARQUET: env.PUBLIC_MONTHLY_PRODUCTION_PARQUET,
  PUBLIC_SCHEMA_JSON: env.PUBLIC_SCHEMA_JSON,
};

const HOSTS = resolveHosts(SETTINGS);
const SOURCES: Source[] = resolveSources(SETTINGS);

function sourceUrl(name: string): string {
  const source = SOURCES.find((s) => s.name === name);
  if (!source) throw new Error(`Unknown source: ${name}`);
  return source.url;
}

/**
 * Get full URL for wells parquet file
 */
export function getWellsUrl(): string {
  return sourceUrl("wells");
}

/**
 * Get full URL for daily production parquet file
 */
export function getDailyProductionUrl(): string {
  return sourceUrl("daily_production");
}

/**
 * Get full URL for monthly production parquet file
 */
export function getMonthlyProductionUrl(): string {
  return sourceUrl("monthly_production");
}

/**
 * Get full URL for schema JSON file, on the Schema host
 */
export function getSchemaUrl(): string {
  return sourceUrl("schema");
}

/**
 * Get full URL for a parquet file by table name
 * @param tableName - Name of the table (e.g., 'wells', 'daily_production')
 * @returns Full URL to the parquet file
 */
export function getParquetUrlByTable(tableName: string): string {
  const source = SOURCES.find(
    (s) => s.kind === "parquet" && s.name === tableName,
  );
  // Fallback: assume a tableName.parquet on the Data host
  return source?.url ?? `${HOSTS.dataHost}/${tableName}.parquet`;
}

/**
 * Get configuration summary for debugging
 */
export function getConfigSummary(): {
  dataHost: string;
  schemaHost: string;
  sources: Source[];
} {
  return { ...HOSTS, sources: SOURCES };
}

/**
 * Log configuration to console (useful for debugging)
 * Call this from browser console: window.volveConfig()
 */
export function logConfig(): void {
  console.group("🔧 Volve Explorer Configuration");
  console.log("Data host:", HOSTS.dataHost);
  console.log("Schema host:", HOSTS.schemaHost);
  console.table(SOURCES);
  console.groupEnd();
}

/**
 * Expose config functions to window for debugging (browser only)
 */
if (browser && typeof window !== "undefined") {
  // @ts-expect-error - Adding to window for debugging
  window.volveConfig = logConfig;
  // @ts-expect-error - Adding to window for debugging
  window.volveConfigSummary = getConfigSummary;
}
