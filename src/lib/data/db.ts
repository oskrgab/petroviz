/**
 * DuckDB Connection Service
 *
 * Initializes and manages a singleton DuckDB-WASM connection.
 * Provides typed query methods for executing SQL against remote Parquet files.
 */

import * as duckdb from "@duckdb/duckdb-wasm";
import { getParquetUrlByTable } from "$lib/config/data-sources";

/**
 * Singleton database instance
 */
let db: duckdb.AsyncDuckDB | null = null;

/**
 * Singleton connection instance
 */
let conn: duckdb.AsyncDuckDBConnection | null = null;

/**
 * Initialization promise to prevent duplicate initialization
 */
let initPromise: Promise<void> | null = null;

/**
 * Check if database is initialized
 */
export function isInitialized(): boolean {
  return db !== null && conn !== null;
}

/**
 * Initialize DuckDB-WASM database
 * Uses the selectBundle pattern to choose the best WASM bundle for the browser
 * @throws Error if initialization fails
 */
export async function initializeDatabase(): Promise<void> {
  // Return if already initialized
  if (isInitialized()) {
    return;
  }

  // Wait for existing initialization
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    try {
      // Use CDN bundles for DuckDB-WASM
      const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();

      // Select the best bundle for this browser
      const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);

      if (!bundle.mainWorker) {
        throw new Error(
          "No suitable DuckDB-WASM bundle found for this browser",
        );
      }

      // Create worker using importScripts wrapper (required for cross-origin CDN)
      const workerUrl = URL.createObjectURL(
        new Blob([`importScripts("${bundle.mainWorker}");`], {
          type: "text/javascript",
        }),
      );

      const worker = new Worker(workerUrl);
      const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING);

      db = new duckdb.AsyncDuckDB(logger, worker);
      await db.instantiate(bundle.mainModule, bundle.pthreadWorker);

      // Clean up the blob URL
      URL.revokeObjectURL(workerUrl);

      // Create connection
      conn = await db.connect();

      // Swap the built-in httpfs for the loadable `httpfs` extension, which
      // does proper HTTP range reads (206 Partial Content) against remote
      // Parquet files. Without this, every query downloads the whole file.
      // Must run before the cache settings / first remote query.
      //
      // NOTE: range reads only work if the data host serves Parquet WITHOUT
      // gzip content-encoding. gzip + HTTP range is incompatible (the range
      // applies to the compressed stream), and DuckDB's footer read then
      // fails with "No magic bytes found at end of file". GitHub Pages
      // auto-gzips .parquet, so the PUBLIC_DATA_BASE_URL host must serve raw
      // Parquet (e.g. dev-petrodb via Caddy, or HuggingFace).
      await conn.query(`
				SET builtin_httpfs = false;
				LOAD httpfs;
			`);

      // Configure for HTTP access to remote files
      await conn.query(`
				SET enable_http_metadata_cache = true;
				SET enable_object_cache = true;
			`);
    } catch (error) {
      // Reset state on error
      db = null;
      conn = null;
      initPromise = null;
      throw new Error(
        `Failed to initialize DuckDB: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  })();

  return initPromise;
}

/**
 * Execute a SQL query and return typed results
 * @param sql - SQL query string
 * @returns Array of result objects
 * @throws Error if database not initialized or query fails
 */
export async function query<T>(sql: string): Promise<T[]> {
  if (!conn) {
    throw new Error(
      "Database not initialized. Call initializeDatabase() first.",
    );
  }

  try {
    const result = await conn.query(sql);
    return result.toArray().map((row) => {
      // Convert Arrow row to plain object
      const obj: Record<string, unknown> = {};
      for (const field of result.schema.fields) {
        const value = row[field.name];
        // Handle BigInt conversion for compatibility
        if (typeof value === "bigint") {
          obj[field.name] = Number(value);
        } else {
          obj[field.name] = value;
        }
      }
      return obj as T;
    });
  } catch (error) {
    throw new Error(
      `Query failed: ${error instanceof Error ? error.message : "Unknown error"}\nSQL: ${sql}`,
    );
  }
}

/**
 * Execute a SQL query and return a single result
 * @param sql - SQL query string
 * @returns Single result object or null if no results
 */
export async function queryOne<T>(sql: string): Promise<T | null> {
  const results = await query<T>(sql);
  return results.length > 0 ? results[0] : null;
}

/**
 * Execute a SQL query and return a scalar value
 * @param sql - SQL query string (should return single column, single row)
 * @returns The scalar value
 */
export async function queryScalar<T>(sql: string): Promise<T> {
  const results = await query<Record<string, T>>(sql);
  if (results.length === 0) {
    throw new Error("Query returned no results");
  }
  const keys = Object.keys(results[0]);
  if (keys.length === 0) {
    throw new Error("Query returned no columns");
  }
  return results[0][keys[0]];
}

/**
 * Build a read_parquet SQL expression for a table
 * Uses the centralized configuration to get the correct parquet file URL
 * @param tableName - Name of the table (e.g., 'wells', 'daily_production')
 * @returns SQL expression like read_parquet('https://...')
 */
export function readParquet(tableName: string): string {
  const url = getParquetUrlByTable(tableName);
  return `read_parquet('${url}')`;
}

/**
 * Close the database connection
 * Call this when the application is closing
 */
export async function closeDatabase(): Promise<void> {
  if (conn) {
    await conn.close();
    conn = null;
  }
  if (db) {
    await db.terminate();
    db = null;
  }
  initPromise = null;
}

/**
 * Get connection status information
 */
export function getConnectionStatus(): {
  initialized: boolean;
  hasConnection: boolean;
} {
  return {
    initialized: isInitialized(),
    hasConnection: conn !== null,
  };
}
