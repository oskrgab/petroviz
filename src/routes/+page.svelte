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
		<div class="loading-brand">
			<div class="loading-logo">
				<svg viewBox="0 0 24 24" fill="currentColor">
					<path d="M12 2C12 2 5 10 5 15C5 18.866 8.134 22 12 22C15.866 22 19 18.866 19 15C19 10 12 2 12 2ZM12 20C9.239 20 7 17.761 7 15C7 11.512 11 5.695 12 4.357C13 5.695 17 11.512 17 15C17 17.761 14.761 20 12 20Z"/>
					<ellipse cx="12" cy="15" rx="4" ry="5" fill="currentColor" opacity="0.3"/>
				</svg>
			</div>
			<h1 class="loading-title">Volve Field</h1>
			<span class="loading-subtitle">Production Analysis</span>
		</div>
		<LoadingSpinner
			size="medium"
			message="Initializing dashboard..."
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
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
		gap: var(--spacing-2xl);
		background: var(--color-background);
	}

	.loading-brand {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--spacing-sm);
		animation: fadeIn 0.5s ease-out;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
			transform: translateY(-10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.loading-logo {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 72px;
		height: 72px;
		background: linear-gradient(135deg, var(--color-oil) 0%, var(--color-oil-soft) 100%);
		border-radius: var(--radius-xl);
		color: white;
		box-shadow: var(--shadow-lg);
		animation: pulse 2s ease-in-out infinite;
	}

	@keyframes pulse {
		0%, 100% {
			transform: scale(1);
			box-shadow: var(--shadow-lg);
		}
		50% {
			transform: scale(1.02);
			box-shadow: var(--shadow-glow);
		}
	}

	.loading-logo svg {
		width: 40px;
		height: 40px;
	}

	.loading-title {
		font-size: var(--font-size-2xl);
		font-weight: 700;
		letter-spacing: -0.03em;
		margin: 0;
		background: linear-gradient(135deg, var(--color-text) 0%, var(--color-text-secondary) 100%);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	.loading-subtitle {
		font-size: var(--font-size-sm);
		font-weight: 500;
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.1em;
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
		background: var(--glass-bg);
		backdrop-filter: var(--backdrop-blur);
		border: 1px solid var(--glass-border);
		border-radius: var(--radius-md);
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		z-index: 10;
		box-shadow: var(--shadow-sm);
	}
</style>
