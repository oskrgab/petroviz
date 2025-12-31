/**
 * Dashboard State Store
 *
 * Centralized reactive state for dashboard filters and UI.
 * Uses Svelte 5 $state runes for reactivity.
 */

import type { DateRange } from '$lib/types';

/**
 * Dashboard filter and UI state
 * Using Svelte 5 $state rune for reactivity
 */
export const dashboardState = $state({
	/** Currently selected well IDs (empty array = all wells) */
	selectedWellIds: [] as number[],

	/** Selected date range for filtering (null = full range) */
	dateRange: null as DateRange | null,

	/** Whether data is currently loading */
	isLoading: false,

	/** Error message if any operation failed */
	error: null as string | null
});

/**
 * Set selected well IDs
 */
export function setSelectedWells(wellIds: number[]): void {
	dashboardState.selectedWellIds = wellIds;
}

/**
 * Toggle a single well selection
 */
export function toggleWellSelection(wellId: number): void {
	const index = dashboardState.selectedWellIds.indexOf(wellId);
	if (index === -1) {
		dashboardState.selectedWellIds = [...dashboardState.selectedWellIds, wellId];
	} else {
		dashboardState.selectedWellIds = dashboardState.selectedWellIds.filter((id) => id !== wellId);
	}
}

/**
 * Select all wells
 */
export function selectAllWells(allWellIds: number[]): void {
	dashboardState.selectedWellIds = [...allWellIds];
}

/**
 * Clear all well selections
 */
export function clearWellSelection(): void {
	dashboardState.selectedWellIds = [];
}

/**
 * Check if a well is selected
 */
export function isWellSelected(wellId: number): boolean {
	return dashboardState.selectedWellIds.includes(wellId);
}

/**
 * Set the date range filter
 */
export function setDateRange(range: DateRange | null): void {
	dashboardState.dateRange = range;
}

/**
 * Clear the date range filter
 */
export function clearDateRange(): void {
	dashboardState.dateRange = null;
}

/**
 * Set loading state
 */
export function setLoading(loading: boolean): void {
	dashboardState.isLoading = loading;
}

/**
 * Set error message
 */
export function setError(error: string | null): void {
	dashboardState.error = error;
}

/**
 * Clear error message
 */
export function clearError(): void {
	dashboardState.error = null;
}

/**
 * Reset all filters to default state
 */
export function resetFilters(): void {
	dashboardState.selectedWellIds = [];
	dashboardState.dateRange = null;
}

/**
 * Get current filter state (for query building)
 */
export function getFilters(): { wellIds: number[] | undefined; dateRange: DateRange | undefined } {
	return {
		wellIds: dashboardState.selectedWellIds.length > 0 ? dashboardState.selectedWellIds : undefined,
		dateRange: dashboardState.dateRange ?? undefined
	};
}
