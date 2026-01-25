/**
 * Query Builder
 *
 * Builds SQL queries using schema-provided column names.
 * All queries use read_parquet() to access remote Parquet files.
 * Column names are retrieved from the schema service - never hardcoded.
 */

import { readParquet } from "./db";
import {
  findColumnByPartialName,
  requireColumn,
  getRelationship,
} from "./schema";
import type { DateRange } from "$lib/types";

/**
 * Table names as constants (these match the parquet filenames)
 */
export const TABLES = {
  DAILY_PRODUCTION: "daily_production",
  WELLS: "wells",
  MONTHLY_PRODUCTION: "monthly_production",
} as const;

/**
 * Get the column name for a specific field, using schema lookup
 * Falls back to known column names if schema not loaded yet
 */
function getColumnName(table: string, field: string): string {
  try {
    // Try to find column by partial name match
    const column = findColumnByPartialName(table, field);
    if (column) return column.name;
    // Fall back to requiring exact name
    return requireColumn(table, field);
  } catch {
    // Schema not loaded - use known column names
    // These are verified against the actual schema
    const knownColumns: Record<string, Record<string, string>> = {
      [TABLES.DAILY_PRODUCTION]: {
        date: "date",
        wellbore_code: "npd_wellbore_code",
        oil: "oil_volume",
        gas: "gas_volume",
        water: "water_volume",
      },
      [TABLES.WELLS]: {
        wellbore_code: "npd_wellbore_code",
        name: "wellbore_name",
        field: "npd_field_name",
        facility: "npd_facility_name",
      },
    };
    return knownColumns[table]?.[field] ?? field;
  }
}

/**
 * Build WHERE clause for well filtering
 */
function buildWellFilter(
  wellIds: number[] | undefined,
  wellCodeColumn: string,
): string {
  if (!wellIds || wellIds.length === 0) {
    return "";
  }
  return `${wellCodeColumn} IN (${wellIds.join(",")})`;
}

/**
 * Build WHERE clause for date range filtering
 */
function buildDateFilter(
  dateRange: DateRange | undefined,
  dateColumn: string,
): string {
  if (!dateRange) {
    return "";
  }
  const startDate = dateRange.start.toISOString().split("T")[0];
  const endDate = dateRange.end.toISOString().split("T")[0];
  return `${dateColumn} >= '${startDate}' AND ${dateColumn} <= '${endDate}'`;
}

/**
 * Combine multiple filter conditions with AND
 */
function combineFilters(...filters: string[]): string {
  const validFilters = filters.filter((f) => f.length > 0);
  if (validFilters.length === 0) {
    return "";
  }
  return "WHERE " + validFilters.join(" AND ");
}

/**
 * Query: Get daily field totals (aggregated by date)
 * Used for the main time series chart
 *
 * @param wellIds - Optional array of well IDs to filter
 * @param dateRange - Optional date range to filter
 * @returns SQL query string
 */
export function dailyFieldTotals(
  wellIds?: number[],
  dateRange?: DateRange,
): string {
  const table = TABLES.DAILY_PRODUCTION;
  const dateCol = getColumnName(table, "date");
  const wellCodeCol = getColumnName(table, "wellbore_code");
  const oilCol = getColumnName(table, "oil");
  const waterCol = getColumnName(table, "water");

  const whereClause = combineFilters(
    buildWellFilter(wellIds, wellCodeCol),
    buildDateFilter(dateRange, dateCol),
  );

  return `
		SELECT
			${dateCol} as date,
			SUM(${oilCol}) as oil,
			SUM(${waterCol}) as water
		FROM ${readParquet(table)}
		${whereClause}
		GROUP BY ${dateCol}
		ORDER BY ${dateCol}
	`.trim();
}

/**
 * Query: Get cumulative oil production by well
 * Used for the top wells bar chart
 *
 * @param wellIds - Optional array of well IDs to filter
 * @param dateRange - Optional date range to filter
 * @returns SQL query string
 */
export function cumulativeByWell(
  wellIds?: number[],
  dateRange?: DateRange,
): string {
  const prodTable = TABLES.DAILY_PRODUCTION;
  const wellsTable = TABLES.WELLS;

  const dateCol = getColumnName(prodTable, "date");
  const prodWellCodeCol = getColumnName(prodTable, "wellbore_code");
  const oilCol = getColumnName(prodTable, "oil");
  const wellsWellCodeCol = getColumnName(wellsTable, "wellbore_code");
  const wellNameCol = getColumnName(wellsTable, "name");

  const whereClause = combineFilters(
    buildWellFilter(wellIds, `p.${prodWellCodeCol}`),
    buildDateFilter(dateRange, `p.${dateCol}`),
  );

  return `
		SELECT
			p.${prodWellCodeCol} as wellId,
			w.${wellNameCol} as wellName,
			SUM(p.${oilCol}) as cumulativeOil
		FROM ${readParquet(prodTable)} p
		JOIN ${readParquet(wellsTable)} w
			ON p.${prodWellCodeCol} = w.${wellsWellCodeCol}
		${whereClause}
		GROUP BY p.${prodWellCodeCol}, w.${wellNameCol}
		ORDER BY cumulativeOil DESC
	`.trim();
}

/**
 * Query: Get field cumulative totals
 * Used for the pie chart showing oil vs water proportions
 *
 * @param wellIds - Optional array of well IDs to filter
 * @param dateRange - Optional date range to filter
 * @returns SQL query string
 */
export function fieldCumulativeTotals(
  wellIds?: number[],
  dateRange?: DateRange,
): string {
  const table = TABLES.DAILY_PRODUCTION;
  const dateCol = getColumnName(table, "date");
  const wellCodeCol = getColumnName(table, "wellbore_code");
  const oilCol = getColumnName(table, "oil");
  const gasCol = getColumnName(table, "gas");
  const waterCol = getColumnName(table, "water");

  const whereClause = combineFilters(
    buildWellFilter(wellIds, wellCodeCol),
    buildDateFilter(dateRange, dateCol),
  );

  return `
		SELECT
			SUM(${oilCol}) as oil,
			SUM(${gasCol}) as gas,
			SUM(${waterCol}) as water
		FROM ${readParquet(table)}
		${whereClause}
	`.trim();
}

/**
 * Query: Get list of all wells
 * Used for the well selector component
 *
 * @returns SQL query string
 */
export function wellList(): string {
  const table = TABLES.WELLS;
  const wellCodeCol = getColumnName(table, "wellbore_code");
  const wellNameCol = getColumnName(table, "name");
  const fieldCol = getColumnName(table, "field");
  const facilityCol = getColumnName(table, "facility");

  return `
		SELECT
			${wellCodeCol} as id,
			${wellNameCol} as name,
			${fieldCol} as field,
			${facilityCol} as facility
		FROM ${readParquet(table)}
		ORDER BY ${wellNameCol}
	`.trim();
}

/**
 * Query: Get date range of available data
 * Used to initialize the date range filter
 *
 * @returns SQL query string
 */
export function dateRange(): string {
  const table = TABLES.DAILY_PRODUCTION;
  const dateCol = getColumnName(table, "date");

  return `
		SELECT
			MIN(${dateCol}) as start,
			MAX(${dateCol}) as end
		FROM ${readParquet(table)}
	`.trim();
}

/**
 * Query: Get daily production for a single well
 * Used for detailed well analysis
 *
 * @param wellId - The well ID to query
 * @param dateRange - Optional date range to filter
 * @returns SQL query string
 */
export function wellDailyProduction(
  wellId: number,
  dateRange?: DateRange,
): string {
  const table = TABLES.DAILY_PRODUCTION;
  const dateCol = getColumnName(table, "date");
  const wellCodeCol = getColumnName(table, "wellbore_code");
  const oilCol = getColumnName(table, "oil");
  const gasCol = getColumnName(table, "gas");
  const waterCol = getColumnName(table, "water");

  const whereClause = combineFilters(
    `${wellCodeCol} = ${wellId}`,
    buildDateFilter(dateRange, dateCol),
  );

  return `
		SELECT
			${dateCol} as date,
			${oilCol} as oil,
			${gasCol} as gas,
			${waterCol} as water
		FROM ${readParquet(table)}
		${whereClause}
		ORDER BY ${dateCol}
	`.trim();
}
