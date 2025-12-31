<script lang="ts">
	/**
	 * TopWellsBarChart Component
	 *
	 * Horizontal bar chart showing wells ranked by cumulative oil production.
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

	// Color constant
	const BAR_COLOR = '#16a34a';

	// Filter invalid values and sort by cumulative oil (highest first)
	const validWells = $derived(
		[...data]
			.filter((d) => {
				if (!d.wellName || typeof d.wellName !== 'string') return false;
				if (!Number.isFinite(d.cumulativeOil) || d.cumulativeOil <= 0) return false;
				return true;
			})
			.sort((a, b) => b.cumulativeOil - a.cumulativeOil)
	);

	// For horizontal bar chart
	const x = (_d: WellCumulativeRecord, i: number) => validWells.length - 1 - i;
	const y = (d: WellCumulativeRecord) => d.cumulativeOil ?? 0;

	function valueTickFormat(value: number): string {
		return formatVolumeAxis(value);
	}

	const categoryTickFormat = $derived((index: number) => {
		const reversedIndex = validWells.length - 1 - Math.round(index);
		const well = validWells[reversedIndex];
		return well?.wellName ?? '';
	});

	function formatBarValue(value: number): string {
		return formatNumber(value, { decimals: 0 });
	}

	const hasData = $derived(validWells.length > 0);
	const dynamicHeight = $derived(Math.max(height, validWells.length * 35 + 60));

	const dataKey = $derived(
		validWells.length === 0
			? 'empty'
			: `${validWells.length}-${validWells.reduce((acc, d) => acc + d.cumulativeOil, 0).toFixed(0)}`
	);

	const yTickValues = $derived(
		Array.from({ length: validWells.length }, (_, i) => i)
	);

	const chartTitle = $derived(
		validWells.length === 1
			? 'Well Oil Production'
			: `Top ${validWells.length} Wells`
	);
</script>

<div class="chart-container">
	<div class="chart-header">
		<div class="header-left">
			<h3>{chartTitle}</h3>
			<span class="subtitle">By Oil Production</span>
		</div>
		<div class="unit-badge">
			<svg viewBox="0 0 24 24" fill="currentColor">
				<path d="M12 2C12 2 5 10 5 15C5 18.866 8.134 22 12 22C15.866 22 19 18.866 19 15C19 10 12 2 12 2Z"/>
			</svg>
			sm³
		</div>
	</div>

	{#if hasData}
		<div class="chart-wrapper">
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
					<VisAxis type="x" label="Cumulative Oil Production (sm³)" tickFormat={valueTickFormat} />
					<VisAxis type="y" tickFormat={categoryTickFormat} tickValues={yTickValues} />
				</VisXYContainer>
			{/key}
		</div>
	{:else}
		<div class="no-data">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
				<rect x="3" y="8" width="4" height="13" rx="1" />
				<rect x="10" y="5" width="4" height="16" rx="1" />
				<rect x="17" y="11" width="4" height="10" rx="1" />
			</svg>
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

	.unit-badge {
		display: inline-flex;
		align-items: center;
		gap: var(--spacing-xs);
		padding: var(--spacing-xs) var(--spacing-sm);
		background: var(--color-oil-soft);
		color: var(--color-oil);
		border-radius: var(--radius-full);
		font-size: var(--font-size-xs);
		font-family: var(--font-mono);
		font-weight: 500;
	}

	.unit-badge svg {
		width: 12px;
		height: 12px;
	}

	.chart-wrapper {
		flex: 1;
		overflow-y: auto;
	}

	.no-data {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 200px;
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

	:global(.unovis-xy-container) {
		width: 100%;
	}
</style>
