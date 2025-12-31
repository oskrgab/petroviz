/**
 * Data Fetching Store
 *
 * Manages fetched data state and provides loading functions.
 * Uses Svelte 5 $state runes for reactivity.
 */

import type {
	Well,
	DailyProductionRecord,
	WellCumulativeRecord,
	FieldCumulativeTotals,
	DateRange
} from '$lib/types';
import { initializeDatabase, query } from '$lib/data/db';
import { loadSchema } from '$lib/data/schema';
import * as queries from '$lib/data/queries';
import { dashboardState, setLoading, setError, clearError, selectAllWells } from './dashboard.svelte';

/**
 * Data state using Svelte 5 $state rune
 */
export const dataState = $state({
	/** List of all available wells */
	wells: [] as Well[],

	/** Daily production time series data */
	dailyProduction: [] as DailyProductionRecord[],

	/** Cumulative production by well */
	wellCumulatives: [] as WellCumulativeRecord[],

	/** Field-level cumulative totals */
	fieldTotals: null as FieldCumulativeTotals | null,

	/** Available date range in the dataset */
	availableDateRange: null as DateRange | null,

	/** Whether initial data has been loaded */
	initialized: false
});

/**
 * Raw query result types for type conversion
 */
interface RawDailyRecord {
	date: string | Date;
	oil: number;
	water: number;
}

interface RawWellCumulative {
	wellId: number;
	wellName: string;
	cumulativeOil: number;
}

interface RawFieldTotals {
	oil: number;
	gas: number;
	water: number;
}

interface RawDateRange {
	start: string | Date;
	end: string | Date;
}

/**
 * Convert date value to Date object
 * Handles: Date objects, ISO strings, timestamps, and DuckDB date numbers (days since epoch)
 * Returns null for invalid/null/undefined values
 */
function toDate(value: unknown): Date | null {
	// Handle null/undefined explicitly
	if (value === null || value === undefined) return null;

	let result: Date;

	if (value instanceof Date) {
		result = value;
	} else if (typeof value === 'string') {
		// Empty strings produce Invalid Date
		if (value.trim() === '') return null;
		result = new Date(value);
	} else if (typeof value === 'number') {
		// DuckDB returns dates as days since epoch (1970-01-01)
		// If the number is small (< 100000), it's likely days, not milliseconds
		if (value < 100000) {
			result = new Date(value * 24 * 60 * 60 * 1000);
		} else {
			result = new Date(value);
		}
	} else {
		// Unknown type - return null instead of trying to convert
		return null;
	}

	// Validate the resulting date
	if (isNaN(result.getTime())) return null;

	return result;
}

/**
 * Safely convert a value to a number, defaulting to 0 for null/undefined/NaN
 */
function safeNumber(value: unknown): number {
	if (value === null || value === undefined) return 0;
	const num = Number(value);
	return Number.isNaN(num) ? 0 : num;
}

/**
 * Initialize the application (schema + database + initial data)
 */
export async function initializeApp(): Promise<void> {
	if (dataState.initialized) return;

	setLoading(true);
	clearError();

	try {
		// Load schema and initialize database in parallel
		await Promise.all([loadSchema(), initializeDatabase()]);

		// Load initial data
		await loadWells();
		await loadAvailableDateRange();

		// Select all wells by default
		if (dataState.wells.length > 0) {
			selectAllWells(dataState.wells.map((w) => w.id));
		}

		// Load production data with current filters (all wells selected)
		await refreshProductionData();

		dataState.initialized = true;
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Failed to initialize application';
		setError(message);
		throw error;
	} finally {
		setLoading(false);
	}
}

/**
 * Load list of all wells
 */
export async function loadWells(): Promise<void> {
	try {
		const sql = queries.wellList();
		const results = await query<Well>(sql);
		dataState.wells = results;
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Failed to load wells';
		setError(message);
		throw error;
	}
}

/**
 * Load available date range from the dataset
 */
export async function loadAvailableDateRange(): Promise<void> {
	try {
		const sql = queries.dateRange();
		const results = await query<RawDateRange>(sql);
		if (results.length > 0) {
			const start = toDate(results[0].start);
			const end = toDate(results[0].end);
			if (start && end) {
				dataState.availableDateRange = { start, end };
			}
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Failed to load date range';
		setError(message);
		throw error;
	}
}

/**
 * Get current filter values for queries
 * Reads fresh values from dashboardState each time
 */
function getFilterParams(): { wellIds: number[] | undefined; dateRange: DateRange | undefined } {
	// Read the current state values
	const selectedWellIds = dashboardState.selectedWellIds;
	const dateRange = dashboardState.dateRange;

	console.log('[getFilterParams] Reading state - selectedWellIds:', selectedWellIds.length, 'ids');

	return {
		wellIds: selectedWellIds.length > 0 ? [...selectedWellIds] : undefined,
		dateRange: dateRange ?? undefined
	};
}

/**
 * Load daily production data with current filters
 * @param forceWellIds - Optional: explicitly pass wellIds to override state
 */
export async function loadDailyProduction(forceWellIds?: number[]): Promise<void> {
	try {
		const { wellIds: stateWellIds, dateRange } = getFilterParams();
		const wellIds = forceWellIds !== undefined
			? (forceWellIds.length > 0 ? forceWellIds : undefined)
			: stateWellIds;
		console.log('[loadDailyProduction] wellIds:', wellIds?.length ?? 'all', 'dateRange:', dateRange ? 'set' : 'none');
		const sql = queries.dailyFieldTotals(wellIds, dateRange);
		console.log('[loadDailyProduction] SQL:', sql.substring(0, 200));
		const results = await query<RawDailyRecord>(sql);
		console.log('[loadDailyProduction] Results:', results.length, 'rows');

		dataState.dailyProduction = results
			.map((row) => {
				const date = toDate(row.date);
				return date
					? {
							date,
							oil: safeNumber(row.oil),
							water: safeNumber(row.water)
						}
					: null;
			})
			.filter((row): row is DailyProductionRecord => row !== null);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Failed to load daily production';
		setError(message);
		throw error;
	}
}

/**
 * Load cumulative production by well with current filters
 * @param forceWellIds - Optional: explicitly pass wellIds to override state
 */
export async function loadWellCumulatives(forceWellIds?: number[]): Promise<void> {
	try {
		const { wellIds: stateWellIds, dateRange } = getFilterParams();
		const wellIds = forceWellIds !== undefined
			? (forceWellIds.length > 0 ? forceWellIds : undefined)
			: stateWellIds;
		const sql = queries.cumulativeByWell(wellIds, dateRange);
		const results = await query<RawWellCumulative>(sql);

		dataState.wellCumulatives = results.map((row) => ({
			wellId: row.wellId,
			wellName: row.wellName || 'Unknown',
			cumulativeOil: safeNumber(row.cumulativeOil)
		}));
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Failed to load well cumulatives';
		setError(message);
		throw error;
	}
}

/**
 * Load field cumulative totals with current filters
 * @param forceWellIds - Optional: explicitly pass wellIds to override state
 */
export async function loadFieldTotals(forceWellIds?: number[]): Promise<void> {
	try {
		const { wellIds: stateWellIds, dateRange } = getFilterParams();
		const wellIds = forceWellIds !== undefined
			? (forceWellIds.length > 0 ? forceWellIds : undefined)
			: stateWellIds;
		const sql = queries.fieldCumulativeTotals(wellIds, dateRange);
		const results = await query<RawFieldTotals>(sql);

		if (results.length > 0) {
			dataState.fieldTotals = {
				oil: safeNumber(results[0].oil),
				gas: safeNumber(results[0].gas),
				water: safeNumber(results[0].water)
			};
		} else {
			dataState.fieldTotals = { oil: 0, gas: 0, water: 0 };
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Failed to load field totals';
		setError(message);
		throw error;
	}
}

/**
 * Refresh all production data with current filters
 * Call this when filters change
 * @param forceWellIds - Optional: explicitly pass wellIds to avoid stale state reads
 */
export async function refreshProductionData(forceWellIds?: number[]): Promise<void> {
	setLoading(true);
	clearError();

	// Log what we're refreshing with
	const currentWellIds = forceWellIds ?? dashboardState.selectedWellIds;
	console.log('[refreshProductionData] Starting refresh with', currentWellIds.length, 'wells');

	try {
		// Load all production data in parallel
		await Promise.all([
			loadDailyProduction(forceWellIds),
			loadWellCumulatives(forceWellIds),
			loadFieldTotals(forceWellIds)
		]);
		console.log('[refreshProductionData] Refresh complete');
	} catch (error) {
		// Error already set by individual loaders
		throw error;
	} finally {
		setLoading(false);
	}
}

/**
 * Get wells sorted alphabetically
 */
export function getSortedWells(): Well[] {
	return [...dataState.wells].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Get top N wells by cumulative oil production
 */
export function getTopWells(count: number = 15): WellCumulativeRecord[] {
	return dataState.wellCumulatives.slice(0, count);
}

/**
 * Check if data is ready for display
 */
export function isDataReady(): boolean {
	return (
		dataState.initialized &&
		dataState.dailyProduction.length > 0 &&
		dataState.fieldTotals !== null
	);
}
