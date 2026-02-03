/**
 * Data Sources Configuration
 *
 * Centralized configuration for all remote data sources.
 * Uses environment variables (PUBLIC_*) to allow flexible deployment.
 *
 * Environment variables are set via:
 * - .env file for local development
 * - GitHub Actions repository variables for production
 */

import { env } from "$env/dynamic/public";
import { browser } from "$app/environment";

/**
 * Default values for configuration
 */
const DEFAULTS = {
  baseUrl: "https://petrodb.ocortez.com",
  wellsParquet: "volve/wells.parquet",
  dailyProductionParquet: "volve/daily_production.parquet",
  monthlyProductionParquet: "volve/monthly_production.parquet",
  schemaJson: "volve/schema.json",
} as const;

/**
 * Track which environment variables are missing
 */
const missingVars: string[] = [];

/**
 * Get environment variable with warning if using default
 */
function getEnvVar(
  key: string,
  envValue: string | undefined,
  defaultValue: string,
  description: string,
): string {
  if (!envValue) {
    missingVars.push(key);
    if (browser) {
      console.warn(
        `⚙️ Config: Using default value for ${key} (${description})\n` +
          `   Default: ${defaultValue}\n` +
          `   Set this variable in .env (local) or GitHub Actions (production)`,
      );
    }
    return defaultValue;
  }
  return envValue;
}

/**
 * Base URL for all data resources
 * Default: https://volve-db.ocortez.com
 */
export const DATA_BASE_URL = getEnvVar(
  "PUBLIC_DATA_BASE_URL",
  env.PUBLIC_DATA_BASE_URL,
  DEFAULTS.baseUrl,
  "Base URL for data files",
);

/**
 * Parquet file paths (relative to base URL or absolute URLs)
 */
export const PARQUET_FILES = {
  wells: getEnvVar(
    "PUBLIC_WELLS_PARQUET",
    env.PUBLIC_WELLS_PARQUET,
    DEFAULTS.wellsParquet,
    "Wells parquet file path",
  ),
  dailyProduction: getEnvVar(
    "PUBLIC_DAILY_PRODUCTION_PARQUET",
    env.PUBLIC_DAILY_PRODUCTION_PARQUET,
    DEFAULTS.dailyProductionParquet,
    "Daily production parquet file path",
  ),
  monthlyProduction: getEnvVar(
    "PUBLIC_MONTHLY_PRODUCTION_PARQUET",
    env.PUBLIC_MONTHLY_PRODUCTION_PARQUET,
    DEFAULTS.monthlyProductionParquet,
    "Monthly production parquet file path",
  ),
} as const;

/**
 * Schema file path (relative to base URL or absolute URL)
 */
export const SCHEMA_FILE = getEnvVar(
  "PUBLIC_SCHEMA_JSON",
  env.PUBLIC_SCHEMA_JSON,
  DEFAULTS.schemaJson,
  "Schema JSON file path",
);

/**
 * Log configuration summary on initialization (browser only)
 */
if (browser && missingVars.length > 0) {
  console.group("⚙️ Volve Explorer Configuration");
  console.warn(
    `Using default values for ${missingVars.length} environment variable(s):\n` +
    missingVars.map((v) => `  - ${v}`).join("\n"),
  );
  console.info(
    "\nTo configure:\n" +
    "  Local dev: Create .env file (see .env.example)\n" +
    "  Production: Set GitHub Actions repository variables",
  );
  console.groupEnd();
}

/**
 * Build a full URL from base URL and a path
 * Handles both relative paths and absolute URLs
 * @param path - Relative path or absolute URL
 * @returns Full URL
 */
function buildUrl(path: string): string {
  // If path is already an absolute URL, return it as-is
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }

  // Remove leading slash from path if present
  const cleanPath = path.startsWith("/") ? path.slice(1) : path;

  // Ensure base URL doesn't end with slash
  const baseUrl = DATA_BASE_URL.endsWith("/")
    ? DATA_BASE_URL.slice(0, -1)
    : DATA_BASE_URL;

  return `${baseUrl}/${cleanPath}`;
}

/**
 * Get full URL for wells parquet file
 */
export function getWellsUrl(): string {
  return buildUrl(PARQUET_FILES.wells);
}

/**
 * Get full URL for daily production parquet file
 */
export function getDailyProductionUrl(): string {
  return buildUrl(PARQUET_FILES.dailyProduction);
}

/**
 * Get full URL for monthly production parquet file
 */
export function getMonthlyProductionUrl(): string {
  return buildUrl(PARQUET_FILES.monthlyProduction);
}

/**
 * Get full URL for schema JSON file
 */
export function getSchemaUrl(): string {
  return buildUrl(SCHEMA_FILE);
}

/**
 * Get full URL for a parquet file by table name
 * @param tableName - Name of the table (e.g., 'wells', 'daily_production')
 * @returns Full URL to the parquet file
 */
export function getParquetUrlByTable(tableName: string): string {
  switch (tableName) {
    case "wells":
      return getWellsUrl();
    case "daily_production":
      return getDailyProductionUrl();
    case "monthly_production":
      return getMonthlyProductionUrl();
    default:
      // Fallback: assume tableName.parquet pattern
      return buildUrl(`${tableName}.parquet`);
  }
}

/**
 * Get configuration summary for debugging
 */
export function getConfigSummary(): {
  baseUrl: string;
  parquetFiles: typeof PARQUET_FILES;
  schemaFile: string;
  urls: {
    wells: string;
    dailyProduction: string;
    monthlyProduction: string;
    schema: string;
  };
  envStatus: {
    configured: string[];
    usingDefaults: string[];
  };
} {
  const configured: string[] = [];
  const usingDefaults: string[] = [];

  // Check which variables are configured
  if (env.PUBLIC_DATA_BASE_URL) configured.push("PUBLIC_DATA_BASE_URL");
  else usingDefaults.push("PUBLIC_DATA_BASE_URL");

  if (env.PUBLIC_WELLS_PARQUET) configured.push("PUBLIC_WELLS_PARQUET");
  else usingDefaults.push("PUBLIC_WELLS_PARQUET");

  if (env.PUBLIC_DAILY_PRODUCTION_PARQUET)
    configured.push("PUBLIC_DAILY_PRODUCTION_PARQUET");
  else usingDefaults.push("PUBLIC_DAILY_PRODUCTION_PARQUET");

  if (env.PUBLIC_MONTHLY_PRODUCTION_PARQUET)
    configured.push("PUBLIC_MONTHLY_PRODUCTION_PARQUET");
  else usingDefaults.push("PUBLIC_MONTHLY_PRODUCTION_PARQUET");

  if (env.PUBLIC_SCHEMA_JSON) configured.push("PUBLIC_SCHEMA_JSON");
  else usingDefaults.push("PUBLIC_SCHEMA_JSON");

  return {
    baseUrl: DATA_BASE_URL,
    parquetFiles: PARQUET_FILES,
    schemaFile: SCHEMA_FILE,
    urls: {
      wells: getWellsUrl(),
      dailyProduction: getDailyProductionUrl(),
      monthlyProduction: getMonthlyProductionUrl(),
      schema: getSchemaUrl(),
    },
    envStatus: {
      configured,
      usingDefaults,
    },
  };
}

/**
 * Log configuration to console (useful for debugging)
 * Call this from browser console: window.volveConfig()
 */
export function logConfig(): void {
  const summary = getConfigSummary();

  console.group("🔧 Volve Explorer Configuration");

  console.group("📊 Environment Variables Status");
  if (summary.envStatus.configured.length > 0) {
    console.log("✅ Configured:", summary.envStatus.configured);
  }
  if (summary.envStatus.usingDefaults.length > 0) {
    console.warn("⚠️  Using Defaults:", summary.envStatus.usingDefaults);
  }
  console.groupEnd();

  console.group("🌐 Data Sources");
  console.log("Base URL:", summary.baseUrl);
  console.log("Wells:", summary.urls.wells);
  console.log("Daily Production:", summary.urls.dailyProduction);
  console.log("Monthly Production:", summary.urls.monthlyProduction);
  console.log("Schema:", summary.urls.schema);
  console.groupEnd();

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
