/**
 * Schema Service
 *
 * Fetches and caches the database schema from the remote server.
 * Provides typed access to table, column, and relationship information.
 * All queries should use this service to get column names dynamically.
 */

import type {
	SchemaDefinition,
	TableSchema,
	ColumnSchema,
	ForeignKey,
	ColumnType
} from '$lib/types';

const SCHEMA_URL = 'https://volve-db.oscarcortez.me/schema.json';

/**
 * Cached schema instance
 */
let cachedSchema: SchemaDefinition | null = null;

/**
 * Loading promise to prevent duplicate fetches
 */
let loadingPromise: Promise<void> | null = null;

/**
 * Raw schema format from volve-db.oscarcortez.me/schema.json
 * Tables is an object keyed by table name, not an array
 */
interface RawColumn {
	name: string;
	type: string;
	not_null?: boolean;
	primary_key?: boolean;
	default_value?: unknown;
	comment?: string | null;
}

interface RawTable {
	columns: RawColumn[];
	foreign_keys?: Array<{
		columns: string[];
		references_table: string;
		references_columns: string[];
	}>;
}

interface RawSchema {
	database?: string;
	description?: string;
	tables: Record<string, RawTable>;
}

/**
 * Parse raw schema response into typed SchemaDefinition
 */
function parseSchema(raw: RawSchema): SchemaDefinition {
	const tableEntries = Object.entries(raw.tables);

	return {
		tables: tableEntries.map(([tableName, table]) => {
			// Extract primary key columns
			const primaryKey = table.columns
				.filter((col) => col.primary_key)
				.map((col) => col.name);

			return {
				name: tableName,
				columns: table.columns.map((col) => ({
					name: col.name,
					type: col.type.toLowerCase() as ColumnType,
					nullable: !col.not_null,
					description: col.comment ?? undefined
				})),
				primaryKey,
				foreignKeys: table.foreign_keys?.map((fk) => ({
					columns: fk.columns,
					references: {
						table: fk.references_table,
						columns: fk.references_columns
					}
				}))
			};
		})
	};
}

/**
 * Load schema from remote server
 * @throws Error if fetch fails or response is invalid
 */
export async function loadSchema(): Promise<void> {
	// Return cached schema if available
	if (cachedSchema) {
		return;
	}

	// Wait for existing load if in progress
	if (loadingPromise) {
		return loadingPromise;
	}

	loadingPromise = (async () => {
		try {
			const response = await fetch(SCHEMA_URL);

			if (!response.ok) {
				throw new Error(`Failed to fetch schema: ${response.status} ${response.statusText}`);
			}

			const raw: RawSchema = await response.json();

			if (!raw.tables || typeof raw.tables !== 'object') {
				throw new Error('Invalid schema format: missing tables object');
			}

			cachedSchema = parseSchema(raw);
		} catch (error) {
			// Reset loading promise on error so retry is possible
			loadingPromise = null;
			throw error;
		}
	})();

	return loadingPromise;
}

/**
 * Check if schema is loaded
 */
export function isSchemaLoaded(): boolean {
	return cachedSchema !== null;
}

/**
 * Get the full schema definition
 * @throws Error if schema not loaded
 */
export function getSchema(): SchemaDefinition {
	if (!cachedSchema) {
		throw new Error('Schema not loaded. Call loadSchema() first.');
	}
	return cachedSchema;
}

/**
 * Get a table by name
 * @param tableName - Name of the table (e.g., 'daily_production', 'wells')
 * @returns TableSchema or undefined if not found
 */
export function getTable(tableName: string): TableSchema | undefined {
	if (!cachedSchema) {
		throw new Error('Schema not loaded. Call loadSchema() first.');
	}
	return cachedSchema.tables.find((t) => t.name === tableName);
}

/**
 * Get a column from a table
 * @param tableName - Name of the table
 * @param columnName - Name of the column
 * @returns ColumnSchema or undefined if not found
 */
export function getColumn(tableName: string, columnName: string): ColumnSchema | undefined {
	const table = getTable(tableName);
	if (!table) return undefined;
	return table.columns.find((c) => c.name === columnName);
}

/**
 * Get column name if it exists, otherwise throw
 * Useful for building SQL queries safely
 * @param tableName - Name of the table
 * @param columnName - Name of the column
 * @returns The column name (validated to exist)
 * @throws Error if column doesn't exist
 */
export function requireColumn(tableName: string, columnName: string): string {
	const column = getColumn(tableName, columnName);
	if (!column) {
		throw new Error(`Column '${columnName}' not found in table '${tableName}'`);
	}
	return column.name;
}

/**
 * Get all columns of a specific type from a table
 * @param tableName - Name of the table
 * @param type - Column type to filter by
 * @returns Array of matching columns
 */
export function getColumnsByType(tableName: string, type: ColumnType): ColumnSchema[] {
	const table = getTable(tableName);
	if (!table) return [];
	return table.columns.filter((c) => c.type === type);
}

/**
 * Get foreign keys for a table
 * @param tableName - Name of the table
 * @returns Array of foreign keys or empty array
 */
export function getForeignKeys(tableName: string): ForeignKey[] {
	const table = getTable(tableName);
	if (!table) return [];
	return table.foreignKeys ?? [];
}

/**
 * Get the foreign key relationship that references another table
 * @param tableName - Name of the table with the foreign key
 * @param referencedTable - Name of the table being referenced
 * @returns ForeignKey or undefined if not found
 */
export function getRelationship(tableName: string, referencedTable: string): ForeignKey | undefined {
	const foreignKeys = getForeignKeys(tableName);
	return foreignKeys.find((fk) => fk.references.table === referencedTable);
}

/**
 * Get all table names in the schema
 * @returns Array of table names
 */
export function getTableNames(): string[] {
	if (!cachedSchema) {
		throw new Error('Schema not loaded. Call loadSchema() first.');
	}
	return cachedSchema.tables.map((t) => t.name);
}

/**
 * Get all column names for a table
 * @param tableName - Name of the table
 * @returns Array of column names
 */
export function getColumnNames(tableName: string): string[] {
	const table = getTable(tableName);
	if (!table) return [];
	return table.columns.map((c) => c.name);
}

/**
 * Find a column by partial name match (case-insensitive)
 * Useful for finding columns like 'oil_sm3' when you know it contains 'oil'
 * @param tableName - Name of the table
 * @param partialName - Partial column name to search for
 * @returns First matching column or undefined
 */
export function findColumnByPartialName(
	tableName: string,
	partialName: string
): ColumnSchema | undefined {
	const table = getTable(tableName);
	if (!table) return undefined;
	const lowerPartial = partialName.toLowerCase();
	return table.columns.find((c) => c.name.toLowerCase().includes(lowerPartial));
}

/**
 * Clear the cached schema (useful for testing or forcing refresh)
 */
export function clearSchemaCache(): void {
	cachedSchema = null;
	loadingPromise = null;
}
