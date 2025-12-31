<script lang="ts">
	/**
	 * DateRangeSelector Component
	 *
	 * A compact brush control for selecting date ranges.
	 * Shows a miniature area chart preview with draggable brush selection.
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

	let {
		data,
		height = 80,
		onDateRangeChange,
		selectedRange = null
	}: Props = $props();

	// Color constants
	const OIL_COLOR = '#16a34a';
	const WATER_COLOR = '#0ea5e9';

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
	function handleBrushEnd(
		selection: [number, number] | null,
		event: MouseEvent,
		userDriven: boolean
	) {
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

	// Create a unique key for the chart
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

	// Format selected range for display
	const rangeLabel = $derived(
		selectedRange
			? `${formatDate(selectedRange.start, 'short')} – ${formatDate(selectedRange.end, 'short')}`
			: 'All time'
	);
</script>

<div class="range-selector">
	<div class="range-header">
		<div class="range-info">
			<svg class="range-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
				<line x1="16" y1="2" x2="16" y2="6" />
				<line x1="8" y1="2" x2="8" y2="6" />
				<line x1="3" y1="10" x2="21" y2="10" />
			</svg>
			<span class="range-label">Date Range</span>
			<span class="range-value">{rangeLabel}</span>
		</div>
		{#if selectedRange}
			<button class="clear-btn" onclick={() => onDateRangeChange?.(null)}>
				<svg viewBox="0 0 16 16" fill="currentColor">
					<path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"/>
				</svg>
				Clear
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
						opacity={0.25}
						curveType="linear"
					/>
					<VisArea
						{x}
						y={yWater}
						color={WATER_COLOR}
						opacity={0.25}
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
	{:else}
		<div class="no-data">
			<p>No data available for date selection</p>
		</div>
	{/if}
</div>

<style>
	.range-selector {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
	}

	.range-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.range-info {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.range-icon {
		width: 16px;
		height: 16px;
		color: var(--color-text-muted);
	}

	.range-label {
		font-size: var(--font-size-sm);
		font-weight: 500;
		color: var(--color-text-secondary);
	}

	.range-value {
		font-size: var(--font-size-sm);
		font-family: var(--font-mono);
		color: var(--color-text);
		padding: var(--spacing-xs) var(--spacing-sm);
		background: var(--color-surface-sunken);
		border-radius: var(--radius-sm);
	}

	.clear-btn {
		display: inline-flex;
		align-items: center;
		gap: var(--spacing-xs);
		padding: var(--spacing-xs) var(--spacing-sm);
		background: transparent;
		border: 1px solid var(--color-border);
		color: var(--color-text-secondary);
		border-radius: var(--radius-sm);
		font-size: var(--font-size-xs);
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.clear-btn svg {
		width: 12px;
		height: 12px;
	}

	.clear-btn:hover {
		border-color: var(--color-error);
		color: var(--color-error);
		background: var(--color-error-soft);
	}

	.brush-container {
		background: var(--color-surface-sunken);
		border-radius: var(--radius-md);
		padding: var(--spacing-sm);
	}

	/* Override brush styling */
	:global(.unovis-brush-selection) {
		fill: var(--color-accent) !important;
		fill-opacity: 0.15 !important;
		stroke: var(--color-accent) !important;
		stroke-width: 1px !important;
	}

	:global(.unovis-brush-handle) {
		fill: var(--color-accent) !important;
	}

	.no-data {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 60px;
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}

	.no-data p {
		margin: 0;
	}
</style>
