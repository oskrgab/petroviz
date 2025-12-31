<script lang="ts">
	/**
	 * CumulativePieChart Component
	 *
	 * Donut chart showing cumulative oil vs water production proportions.
	 * Uses Unovis Svelte components.
	 */

	import { VisSingleContainer, VisDonut } from '@unovis/svelte';
	import { formatVolume, formatPercent } from '$lib/utils/formatters';

	interface Props {
		oilTotal: number;
		waterTotal: number;
		height?: number;
	}

	let { oilTotal, waterTotal, height = 300 }: Props = $props();

	// Color constants matching design spec
	const OIL_COLOR = '#2ecc71';
	const WATER_COLOR = '#3498db';

	// Data record type
	interface PieDataRecord {
		label: string;
		value: number;
		color: string;
	}

	// Compute chart data
	const data = $derived<PieDataRecord[]>([
		{ label: 'Oil', value: oilTotal, color: OIL_COLOR },
		{ label: 'Water', value: waterTotal, color: WATER_COLOR }
	]);

	// Compute total
	const total = $derived(oilTotal + waterTotal);

	// Compute percentages
	const oilPercent = $derived(total > 0 ? formatPercent(oilTotal / total, true) : '0%');
	const waterPercent = $derived(total > 0 ? formatPercent(waterTotal / total, true) : '0%');

	// Data accessors
	const value = (d: PieDataRecord) => d.value;
	const color = (d: PieDataRecord) => d.color;

	// Central label showing total
	const centralLabel = $derived(formatVolume(total));
	const centralSubLabel = 'Total';

	// Has data check
	const hasData = $derived(total > 0);
</script>

<div class="chart-container">
	<div class="chart-header">
		<h3>Field Cumulative Production</h3>
		<span class="subtitle">(Oil & Water, sm3)</span>
	</div>

	{#if hasData}
		<div class="chart-wrapper">
			<VisSingleContainer {data} {height}>
				<VisDonut
					{value}
					{color}
					arcWidth={60}
					{centralLabel}
					{centralSubLabel}
					showEmptySegments={false}
				/>
			</VisSingleContainer>
		</div>

		<div class="legend">
			<div class="legend-item">
				<span class="legend-color" style="background-color: {OIL_COLOR};"></span>
				<span class="legend-label">Oil</span>
				<span class="legend-value">{oilPercent}</span>
				<span class="legend-absolute">({formatVolume(oilTotal)})</span>
			</div>
			<div class="legend-item">
				<span class="legend-color" style="background-color: {WATER_COLOR};"></span>
				<span class="legend-label">Water</span>
				<span class="legend-value">{waterPercent}</span>
				<span class="legend-absolute">({formatVolume(waterTotal)})</span>
			</div>
		</div>
	{:else}
		<div class="no-data">
			<p>No production data available</p>
		</div>
	{/if}
</div>

<style>
	.chart-container {
		display: flex;
		flex-direction: column;
		height: 100%;
	}

	.chart-header {
		text-align: center;
		margin-bottom: var(--spacing-sm);
	}

	.chart-header h3 {
		margin: 0;
		font-size: var(--font-size-lg);
	}

	.subtitle {
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
	}

	.chart-wrapper {
		flex: 1;
		min-height: 200px;
	}

	.legend {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
		padding: var(--spacing-md);
		background: var(--color-background);
		border-radius: calc(var(--border-radius) / 2);
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.legend-color {
		width: 16px;
		height: 16px;
		border-radius: 4px;
		flex-shrink: 0;
	}

	.legend-label {
		font-weight: 500;
		min-width: 50px;
	}

	.legend-value {
		font-weight: 600;
		min-width: 50px;
	}

	.legend-absolute {
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
	}

	.no-data {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 200px;
		color: var(--color-text-secondary);
	}
</style>
