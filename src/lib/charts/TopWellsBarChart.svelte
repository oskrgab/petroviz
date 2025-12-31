<script lang="ts">
	/**
	 * TopWellsBarChart Component
	 *
	 * Horizontal bar chart showing wells ranked by cumulative oil production.
	 * Renders all wells passed in via data prop (filtering/limiting should be done by parent).
	 * Uses Unovis Svelte components.
	 */

	import { VisXYContainer, VisGroupedBar, VisAxis } from '@unovis/svelte';
	import type { WellCumulativeRecord } from '$lib/types';
	import { formatVolumeAxis, formatNumber } from '$lib/utils/formatters';

	interface Props {
		data: WellCumulativeRecord[];
		height?: number;
	}

	let { data, height = 350 }: Props = $props();

	// Color constant matching design spec
	const BAR_COLOR = '#2ecc71';

	// Filter invalid values and sort by cumulative oil (highest first)
	const validWells = $derived(
		[...data]
			.filter((d) => {
				// Ensure wellName exists and is a non-empty string
				if (!d.wellName || typeof d.wellName !== 'string') return false;
				// Ensure cumulativeOil is a finite positive number
				if (!Number.isFinite(d.cumulativeOil) || d.cumulativeOil <= 0) return false;
				return true;
			})
			.sort((a, b) => b.cumulativeOil - a.cumulativeOil)
	);

	// For horizontal bar chart with orientation="horizontal":
	// x = index (category position on y-axis) - reversed so highest is at top
	// y = value (cumulativeOil - the bar length on x-axis)
	const x = (_d: WellCumulativeRecord, i: number) => validWells.length - 1 - i;
	const y = (d: WellCumulativeRecord) => d.cumulativeOil ?? 0;

	// Format x-axis (horizontal - shows values) with volume formatting
	function valueTickFormat(value: number): string {
		return formatVolumeAxis(value);
	}

	// Format y-axis (vertical - shows well names) using reversed indices
	const categoryTickFormat = $derived((index: number) => {
		// Reverse the index to match the reversed x accessor
		const reversedIndex = validWells.length - 1 - Math.round(index);
		const well = validWells[reversedIndex];
		return well?.wellName ?? '';
	});

	// Format value for bar labels
	function formatBarValue(value: number): string {
		return formatNumber(value, { decimals: 0 });
	}

	// Has data check
	const hasData = $derived(validWells.length > 0);

	// Calculate dynamic height based on number of wells
	const dynamicHeight = $derived(Math.max(height, validWells.length * 35 + 60));

	// Create a unique key for the chart that changes when data content changes
	const dataKey = $derived(
		validWells.length === 0
			? 'empty'
			: `${validWells.length}-${validWells.reduce((acc, d) => acc + d.cumulativeOil, 0).toFixed(0)}`
	);

	// Explicit tick values for y-axis to prevent label duplication
	const yTickValues = $derived(
		Array.from({ length: validWells.length }, (_, i) => i)
	);

	// Dynamic title based on well count
	const chartTitle = $derived(
		validWells.length === 1
			? 'Well Oil Production'
			: `Top ${validWells.length} Wells by Oil Production`
	);
</script>

<div class="chart-container">
	<div class="chart-header">
		<h3>{chartTitle}</h3>
	</div>

	{#if hasData}
		<div class="chart-wrapper">
			<!-- Key block forces re-render when data changes (Unovis doesn't react to data prop changes) -->
			{#key dataKey}
				<VisXYContainer data={validWells} height={dynamicHeight}>
					<VisGroupedBar
						{x}
						{y}
						orientation="horizontal"
						color={BAR_COLOR}
						roundedCorners={4}
						barPadding={0.2}
					/>
					<VisAxis type="x" label="Cumulative Oil Production (sm3)" tickFormat={valueTickFormat} />
					<VisAxis type="y" tickFormat={categoryTickFormat} tickValues={yTickValues} />
				</VisXYContainer>
			{/key}
		</div>

		<div class="values-overlay">
			{#each validWells as well, i (well.wellId)}
				<div class="value-label" style="top: {(i + 0.5) * (dynamicHeight - 60) / validWells.length + 30}px">
					{formatBarValue(well.cumulativeOil)}
				</div>
			{/each}
		</div>
	{:else}
		<div class="no-data">
			<p>No well production data available</p>
		</div>
	{/if}
</div>

<style>
	.chart-container {
		display: flex;
		flex-direction: column;
		height: 100%;
		position: relative;
	}

	.chart-header {
		margin-bottom: var(--spacing-sm);
	}

	.chart-header h3 {
		margin: 0;
		font-size: var(--font-size-lg);
	}

	.chart-wrapper {
		flex: 1;
		overflow-y: auto;
	}

	.values-overlay {
		position: absolute;
		top: 0;
		right: var(--spacing-md);
		bottom: 0;
		display: none; /* Hidden by default - values shown via tooltip */
	}

	.value-label {
		position: absolute;
		right: 0;
		font-size: var(--font-size-sm);
		font-weight: 500;
		color: var(--color-text);
	}

	.no-data {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 200px;
		color: var(--color-text-secondary);
	}

	/* Ensure bar chart has proper styling */
	:global(.unovis-xy-container) {
		width: 100%;
	}
</style>
