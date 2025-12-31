<script lang="ts">
	/**
	 * Main Dashboard Page
	 *
	 * Integrates all components: WellSelector, DashboardLayout, and all charts.
	 * Handles initialization, state management, and data refresh on filter changes.
	 */

	import { onMount } from 'svelte';
	import DashboardLayout from '$lib/components/DashboardLayout.svelte';
	import WellSelector from '$lib/components/WellSelector.svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import ErrorMessage from '$lib/components/ErrorMessage.svelte';
	import DailyProductionChart from '$lib/charts/DailyProductionChart.svelte';
	import DateRangeSelector from '$lib/charts/DateRangeSelector.svelte';
	import CumulativePieChart from '$lib/charts/CumulativePieChart.svelte';
	import TopWellsBarChart from '$lib/charts/TopWellsBarChart.svelte';
	import { dashboardState, setDateRange } from '$lib/stores/dashboard.svelte';
	import {
		dataState,
		initializeApp,
		refreshProductionData
	} from '$lib/stores/data.svelte';
	import type { DateRange } from '$lib/types';

	// Handle date range change from brush selection
	function handleDateRangeChange(range: DateRange | null) {
		setDateRange(range);
		// Trigger data refresh when date range changes
		if (dataState.initialized) {
			refreshProductionData().catch((err) => {
				console.error('Failed to refresh data:', err);
			});
		}
	}

	// Handle well selection change - trigger data refresh
	function handleWellSelectionChange(selectedIds?: number[]) {
		// Use passed IDs or read from state
		const wellIds = selectedIds ?? dashboardState.selectedWellIds;
		console.log('[handleWellSelectionChange] called, initialized:', dataState.initialized, 'selectedWells:', wellIds.length);
		if (dataState.initialized) {
			console.log('[handleWellSelectionChange] triggering refreshProductionData with', wellIds.length, 'wells');
			// Pass wellIds explicitly to avoid stale state
			refreshProductionData([...wellIds]).catch((err) => {
				console.error('Failed to refresh data:', err);
			});
		}
	}

	// Initialize on mount
	onMount(() => {
		initializeApp().catch((err) => {
			console.error('Failed to initialize:', err);
		});
	});

	// Derived state for bar chart - use all well cumulatives (already sorted by production)
	const wellCumulatives = $derived(dataState.wellCumulatives);
</script>

<svelte:head>
	<title>Volve Field Production Analysis</title>
</svelte:head>

{#if dashboardState.error && !dataState.initialized}
	<!-- Fatal error during initialization -->
	<ErrorMessage
		variant="page"
		title="Unable to Load Dashboard"
		message={dashboardState.error}
		onRetry={() => location.reload()}
	/>
{:else if !dataState.initialized}
	<!-- Loading state -->
	<div class="loading-page">
		<LoadingSpinner
			size="large"
			message="Loading dashboard..."
			detail="Connecting to data source..."
		/>
	</div>
{:else}
	<!-- Main dashboard -->
	<DashboardLayout>
		{#snippet sidebar()}
			<WellSelector
				wells={dataState.wells}
				onSelectionChange={handleWellSelectionChange}
			/>

			{#if dashboardState.error}
				<ErrorMessage
					variant="banner"
					message={dashboardState.error}
					onRetry={() => refreshProductionData()}
				/>
			{/if}
		{/snippet}

		{#snippet mainChart()}
			{#if dashboardState.isLoading}
				<div class="chart-loading">
					<LoadingSpinner size="small" />
					<span>Updating...</span>
				</div>
			{/if}
			<DailyProductionChart data={dataState.dailyProduction} />
		{/snippet}

		{#snippet rangeSelector()}
			<DateRangeSelector
				data={dataState.dailyProduction}
				selectedRange={dashboardState.dateRange}
				onDateRangeChange={handleDateRangeChange}
			/>
		{/snippet}

		{#snippet pieChart()}
			{#if dataState.fieldTotals}
				<CumulativePieChart
					oilTotal={dataState.fieldTotals.oil}
					waterTotal={dataState.fieldTotals.water}
				/>
			{/if}
		{/snippet}

		{#snippet barChart()}
			<TopWellsBarChart data={wellCumulatives} />
		{/snippet}
	</DashboardLayout>
{/if}

<style>
	/* Loading page wrapper */
	.loading-page {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
	}

	/* Chart loading overlay */
	.chart-loading {
		position: absolute;
		top: var(--spacing-sm);
		right: var(--spacing-sm);
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
		padding: var(--spacing-xs) var(--spacing-sm);
		background: rgba(255, 255, 255, 0.9);
		border-radius: calc(var(--border-radius) / 2);
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		z-index: 10;
	}
</style>
