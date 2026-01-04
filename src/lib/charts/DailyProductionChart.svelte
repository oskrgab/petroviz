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

	// Color constants using CSS custom properties
	const OIL_COLOR = 'var(--color-oil)';
	const WATER_COLOR = 'var(--color-water)';
	// Hard-coded for Unovis (doesn't support CSS vars in JS)
	const OIL_HEX = '#16a34a';
	const WATER_HEX = '#0ea5e9';

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

	// Tooltip template with colored indicators
	// Unovis handles text color via --vis-tooltip-text-color CSS variable
	function tooltipTemplate(d: DailyProductionRecord): string {
		const dateStr = formatDate(d.date, 'medium');
		const oilFormatted = formatNumber(d.oil, { decimals: 0 });
		const waterFormatted = formatNumber(d.water, { decimals: 0 });

		return `
			<div style="padding: 10px; font-size: 12px; min-width: 160px;">
				<div style="font-weight: 600; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px solid rgba(128,128,128,0.3);">${dateStr}</div>
				<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
					<span style="width: 10px; height: 10px; border-radius: 50%; background: ${OIL_HEX}; flex-shrink: 0;"></span>
					<span style="opacity: 0.7;">Oil</span>
					<span style="font-weight: 600; font-family: 'IBM Plex Mono', monospace; margin-left: auto;">${oilFormatted} sm³/d</span>
				</div>
				<div style="display: flex; align-items: center; gap: 8px;">
					<span style="width: 10px; height: 10px; border-radius: 50%; background: ${WATER_HEX}; flex-shrink: 0;"></span>
					<span style="opacity: 0.7;">Water</span>
					<span style="font-weight: 600; font-family: 'IBM Plex Mono', monospace; margin-left: auto;">${waterFormatted} sm³/d</span>
				</div>
			</div>
		`;
	}

	// Crosshair circle colors matching series
	const crosshairColors = [OIL_HEX, WATER_HEX];
	function crosshairColor(_d: DailyProductionRecord, i: number): string {
		return crosshairColors[i] ?? OIL_HEX;
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
	const dataKey = $derived(
		validData.length === 0
			? 'empty'
			: `${validData.length}-${validData.reduce((acc, d) => acc + d.oil, 0).toFixed(0)}`
	);
</script>

<div class="chart-container">
	<div class="chart-header">
		<div class="header-left">
			<h3>Daily Production</h3>
			<span class="subtitle">Over Time</span>
		</div>
		<div class="legend">
			<span class="legend-item">
				<span class="legend-dot oil"></span>
				Oil
			</span>
			<span class="legend-item">
				<span class="legend-dot water"></span>
				Water
			</span>
		</div>
	</div>

	{#if hasData}
		{#key dataKey}
			<VisXYContainer data={validData} {height}>
				<VisLine {x} y={yOil} color={OIL_HEX} curveType="linear" lineWidth={2} />
				<VisLine {x} y={yWater} color={WATER_HEX} curveType="linear" lineWidth={2} />
				<VisAxis type="x" label="Date" tickFormat={xTickFormat} />
				<VisAxis type="y" label="Daily Production (sm³/d)" tickFormat={yTickFormat} />
				<VisCrosshair {x} y={[yOil, yWater]} color={crosshairColor} template={tooltipTemplate} />
				<VisTooltip />
			</VisXYContainer>
		{/key}
	{:else}
		<div class="no-data">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
				<path d="M3 3v18h18" stroke-linecap="round" stroke-linejoin="round" />
				<path d="M7 16l4-4 4 4 6-6" stroke-linecap="round" stroke-linejoin="round" />
			</svg>
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
		align-items: flex-start;
		margin-bottom: var(--spacing-md);
	}

	.header-left {
		display: flex;
		flex-direction: column;
		gap: 0;
	}

	.chart-header h3 {
		margin: 0;
		font-size: var(--font-size-lg);
		font-weight: 600;
		letter-spacing: -0.01em;
	}

	.subtitle {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}

	.legend {
		display: flex;
		gap: var(--spacing-lg);
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
	}

	.legend-dot {
		width: 10px;
		height: 10px;
		border-radius: var(--radius-sm);
	}

	.legend-dot.oil {
		background: var(--color-oil);
	}

	.legend-dot.water {
		background: var(--color-water);
	}

	.no-data {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 300px;
		gap: var(--spacing-md);
		color: var(--color-text-muted);
	}

	.no-data svg {
		width: 48px;
		height: 48px;
		opacity: 0.5;
	}

	.no-data p {
		margin: 0;
		font-size: var(--font-size-sm);
	}

	/* Unovis chart styling - container should respect explicit height and fill width */
	:global(.unovis-xy-container) {
		flex: 0 0 auto;
		width: 100%;
	}

	/* Custom tooltip styling */
	:global(.chart-tooltip) {
		padding: var(--spacing-sm);
		font-size: var(--font-size-xs);
		min-width: 160px;
	}

	:global(.tooltip-date) {
		font-weight: 600;
		margin-bottom: var(--spacing-sm);
		padding-bottom: var(--spacing-xs);
		border-bottom: 1px solid var(--color-border);
		color: var(--color-text);
	}

	:global(.tooltip-row) {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		margin-bottom: var(--spacing-xs);
	}

	:global(.tooltip-row:last-child) {
		margin-bottom: 0;
	}

	:global(.tooltip-dot) {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	:global(.tooltip-label) {
		color: var(--color-text-secondary);
	}

	:global(.tooltip-value) {
		font-weight: 500;
		font-family: var(--font-mono);
		margin-left: auto;
		color: var(--color-text);
	}
</style>
