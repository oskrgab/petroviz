<script lang="ts">
	/**
	 * DailyProductionChart Component
	 *
	 * Time series line chart showing daily oil and water production.
	 * Uses Unovis Svelte components.
	 */

	import { VisXYContainer, VisLine, VisAxis, VisCrosshair, VisTooltip } from '@unovis/svelte';
	import type { DailyProductionRecord } from '$lib/types';
	import { formatDate, formatNumber, formatVolumeAxis } from '$lib/utils/formatters';

	interface Props {
		data: DailyProductionRecord[];
		height?: number;
	}

	let { data, height = 400 }: Props = $props();

	// Color constants matching design spec
	const OIL_COLOR = '#2ecc71';
	const WATER_COLOR = '#3498db';

	// Filter out any records with invalid dates or NaN values
	const validData = $derived(
		data.filter((d) => {
			// Ensure date exists and is a valid Date object
			if (!d.date || !(d.date instanceof Date)) return false;
			const timestamp = d.date.getTime();
			if (!Number.isFinite(timestamp)) return false;
			// Ensure numeric values are finite
			if (!Number.isFinite(d.oil) || !Number.isFinite(d.water)) return false;
			return true;
		})
	);

	// Data accessors - safe because validData is pre-filtered
	const x = (d: DailyProductionRecord) => d.date.getTime();
	const yOil = (d: DailyProductionRecord) => d.oil ?? 0;
	const yWater = (d: DailyProductionRecord) => d.water ?? 0;

	// Tooltip template with colored indicators
	function tooltipTemplate(d: DailyProductionRecord): string {
		const dateStr = formatDate(d.date, 'medium');
		const oilFormatted = formatNumber(d.oil, { decimals: 0 });
		const waterFormatted = formatNumber(d.water, { decimals: 0 });

		return `
			<div style="padding: 8px; font-size: 12px; min-width: 150px;">
				<div style="font-weight: 600; margin-bottom: 6px; border-bottom: 1px solid #eee; padding-bottom: 4px;">${dateStr}</div>
				<div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
					<span style="width: 10px; height: 10px; border-radius: 50%; background: ${OIL_COLOR}; flex-shrink: 0;"></span>
					<span style="color: #666;">Oil:</span>
					<span style="font-weight: 500; margin-left: auto;">${oilFormatted} sm³/d</span>
				</div>
				<div style="display: flex; align-items: center; gap: 6px;">
					<span style="width: 10px; height: 10px; border-radius: 50%; background: ${WATER_COLOR}; flex-shrink: 0;"></span>
					<span style="color: #666;">Water:</span>
					<span style="font-weight: 500; margin-left: auto;">${waterFormatted} sm³/d</span>
				</div>
			</div>
		`;
	}

	// Crosshair circle colors matching series
	const crosshairColors = [OIL_COLOR, WATER_COLOR];
	function crosshairColor(_d: DailyProductionRecord, i: number): string {
		return crosshairColors[i] ?? OIL_COLOR;
	}

	// X-axis tick formatter
	function xTickFormat(timestamp: number): string {
		return formatDate(new Date(timestamp), 'axis');
	}

	// Y-axis tick formatter
	function yTickFormat(value: number): string {
		return formatVolumeAxis(value);
	}

	// Chart has data check
	const hasData = $derived(validData && validData.length > 0);

	// Create a unique key for the chart that changes when data content changes
	// Using length + sum of oil values to detect different data sets
	const dataKey = $derived(
		validData.length === 0
			? 'empty'
			: `${validData.length}-${validData.reduce((acc, d) => acc + d.oil, 0).toFixed(0)}`
	);
</script>

<div class="chart-container">
	<div class="chart-header">
		<h3>Daily Production Over Time</h3>
		<div class="legend">
			<span class="legend-item">
				<span class="legend-color" style="background-color: {OIL_COLOR};"></span>
				Oil
			</span>
			<span class="legend-item">
				<span class="legend-color" style="background-color: {WATER_COLOR};"></span>
				Water
			</span>
		</div>
	</div>

	{#if hasData}
		<!-- Key block forces re-render when data changes (Unovis doesn't react to data prop changes) -->
		{#key dataKey}
			<VisXYContainer data={validData} {height}>
				<VisLine {x} y={yOil} color={OIL_COLOR} curveType="linear" />
				<VisLine {x} y={yWater} color={WATER_COLOR} curveType="linear" />
				<VisAxis type="x" label="Date" tickFormat={xTickFormat} />
				<VisAxis type="y" label="Daily Production (sm3/d)" tickFormat={yTickFormat} />
				<VisCrosshair {x} y={[yOil, yWater]} color={crosshairColor} template={tooltipTemplate} />
				<VisTooltip />
			</VisXYContainer>
		{/key}
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
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: var(--spacing-md);
	}

	.chart-header h3 {
		margin: 0;
		font-size: var(--font-size-lg);
	}

	.legend {
		display: flex;
		gap: var(--spacing-md);
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
		font-size: var(--font-size-sm);
	}

	.legend-color {
		width: 12px;
		height: 12px;
		border-radius: 2px;
	}

	.no-data {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 300px;
		color: var(--color-text-secondary);
	}

	/* Unovis chart styling */
	:global(.unovis-xy-container) {
		flex: 1;
	}
</style>
