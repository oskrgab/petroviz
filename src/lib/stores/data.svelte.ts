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
import { dashboardState, setLoading, setError, clearError } from './dashboard.svelte';

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
 * Convert date string/Date to Date object
 */
function toDate(value: string | Date): Date {
	if (value instanceof Date) return value;
	return new Date(value);
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

		// Load production data with current filters
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
			dataState.availableDateRange = {
				start: toDate(results[0].start),
				end: toDate(results[0].end)
			};
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Failed to load date range';
		setError(message);
		throw error;
	}
}

/**
 * Get current filter values for queries
 */
function getFilterParams(): { wellIds: number[] | undefined; dateRange: DateRange | undefined } {
	return {
		wellIds:
			dashboardState.selectedWellIds.length > 0 ? dashboardState.selectedWellIds : undefined,
		dateRange: dashboardState.dateRange ?? undefined
	};
}

/**
 * Load daily production data with current filters
 */
export async function loadDailyProduction(): Promise<void> {
	try {
		const { wellIds, dateRange } = getFilterParams();
		const sql = queries.dailyFieldTotals(wellIds, dateRange);
		const results = await query<RawDailyRecord>(sql);

		dataState.dailyProduction = results.map((row) => ({
			date: toDate(row.date),
			oil: row.oil ?? 0,
			water: row.water ?? 0
		}));
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Failed to load daily production';
		setError(message);
		throw error;
	}
}

/**
 * Load cumulative production by well with current filters
 */
export async function loadWellCumulatives(): Promise<void> {
	try {
		const { wellIds, dateRange } = getFilterParams();
		const sql = queries.cumulativeByWell(wellIds, dateRange);
		const results = await query<RawWellCumulative>(sql);

		dataState.wellCumulatives = results.map((row) => ({
			wellId: row.wellId,
			wellName: row.wellName,
			cumulativeOil: row.cumulativeOil ?? 0
		}));
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Failed to load well cumulatives';
		setError(message);
		throw error;
	}
}

/**
 * Load field cumulative totals with current filters
 */
export async function loadFieldTotals(): Promise<void> {
	try {
		const { wellIds, dateRange } = getFilterParams();
		const sql = queries.fieldCumulativeTotals(wellIds, dateRange);
		const results = await query<RawFieldTotals>(sql);

		if (results.length > 0) {
			dataState.fieldTotals = {
				oil: results[0].oil ?? 0,
				gas: results[0].gas ?? 0,
				water: results[0].water ?? 0
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
 */
export async function refreshProductionData(): Promise<void> {
	setLoading(true);
	clearError();

	try {
		// Load all production data in parallel
		await Promise.all([loadDailyProduction(), loadWellCumulatives(), loadFieldTotals()]);
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
