<script lang="ts">
	/**
	 * DateRangeSelector Component
	 *
	 * A compact brush control for selecting date ranges.
	 * Shows a miniature area chart preview with draggable brush selection.
	 * Designed to be positioned below the main chart.
	 */

	import { VisXYContainer, VisArea, VisAxis, VisBrush } from '@unovis/svelte';
	import type { DailyProductionRecord, DateRange } from '$lib/types';
	import { formatDate } from '$lib/utils/formatters';

	interface Props {
		data: DailyProductionRecord[];
		height?: number;
		onDateRangeChange?: (range: DateRange | null) => void;
		selectedRange?: DateRange | null;
	}

	let { data, height = 80, onDateRangeChange, selectedRange = null }: Props = $props();

	// Color constants (muted for the mini preview)
	const OIL_COLOR = '#2ecc71';
	const WATER_COLOR = '#3498db';

	// Filter out any records with invalid dates or NaN values
	const validData = $derived(
		data.filter((d) => {
			if (!d.date || !(d.date instanceof Date)) return false;
			const timestamp = d.date.getTime();
			if (!Number.isFinite(timestamp)) return false;
			if (!Number.isFinite(d.oil) || !Number.isFinite(d.water)) return false;
			return true;
		})
	);

	// Data accessors
	const x = (d: DailyProductionRecord) => d.date.getTime();
	const yOil = (d: DailyProductionRecord) => d.oil ?? 0;
	const yWater = (d: DailyProductionRecord) => d.water ?? 0;

	// X-axis tick formatter
	function xTickFormat(timestamp: number): string {
		return formatDate(new Date(timestamp), 'axis');
	}

	// Handle brush selection end
	function handleBrushEnd(selection: [number, number] | null, event: MouseEvent, userDriven: boolean) {
		if (!userDriven) return;

		if (selection && selection[0] !== selection[1]) {
			const range: DateRange = {
				start: new Date(selection[0]),
				end: new Date(selection[1])
			};
			onDateRangeChange?.(range);
		} else {
			onDateRangeChange?.(null);
		}
	}

	// Chart has data check
	const hasData = $derived(validData && validData.length > 0);

	// Create a unique key for the chart that changes when data content changes
	const dataKey = $derived(
		validData.length === 0
			? 'empty'
			: `${validData.length}-${validData.reduce((acc, d) => acc + d.oil, 0).toFixed(0)}`
	);

	// Compute brush selection from selectedRange
	const brushSelection = $derived<[number, number] | undefined>(
		selectedRange
			? [selectedRange.start.getTime(), selectedRange.end.getTime()]
			: undefined
	);
</script>

<div class="range-selector">
	<div class="range-header">
		<span class="range-label">Date Range</span>
		{#if selectedRange}
			<button class="clear-btn" onclick={() => onDateRangeChange?.(null)}>
				Clear Selection
			</button>
		{/if}
	</div>

	{#if hasData}
		{#key dataKey}
			<div class="brush-container">
				<VisXYContainer data={validData} {height}>
					<VisArea
						{x}
						y={yOil}
						color={OIL_COLOR}
						opacity={0.3}
						curveType="linear"
					/>
					<VisArea
						{x}
						y={yWater}
						color={WATER_COLOR}
						opacity={0.3}
						curveType="linear"
					/>
					<VisAxis type="x" tickFormat={xTickFormat} numTicks={6} />
					<VisBrush
						draggable={true}
						selection={brushSelection}
						onBrushEnd={handleBrushEnd}
					/>
				</VisXYContainer>
			</div>
		{/key}
		<p class="brush-hint">Drag to select a date range, or drag edges to adjust</p>
	{:else}
		<div class="no-data">
			<p>No data available</p>
		</div>
	{/if}
</div>

<style>
	.range-selector {
		display: flex;
		flex-direction: column;
	}

	.range-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: var(--spacing-sm);
	}

	.range-label {
		font-size: var(--font-size-sm);
		font-weight: 500;
		color: var(--color-text-secondary);
	}

	.clear-btn {
		padding: var(--spacing-xs) var(--spacing-sm);
		background: transparent;
		border: 1px solid var(--color-border);
		color: var(--color-text-secondary);
		border-radius: calc(var(--border-radius) / 2);
		font-size: var(--font-size-xs);
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.clear-btn:hover {
		border-color: var(--color-water);
		color: var(--color-water);
	}

	.brush-container {
		background: var(--color-background);
		border-radius: calc(var(--border-radius) / 2);
		padding: var(--spacing-xs);
	}

	.brush-hint {
		text-align: center;
		font-size: var(--font-size-xs);
		color: var(--color-text-secondary);
		margin-top: var(--spacing-xs);
		margin-bottom: 0;
	}

	.no-data {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 60px;
		color: var(--color-text-secondary);
		font-size: var(--font-size-sm);
	}
</style>
