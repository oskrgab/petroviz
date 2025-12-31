<script lang="ts">
	/**
	 * DashboardLayout Component
	 *
	 * Responsive grid layout for the production dashboard.
	 * Main chart on top, pie and bar charts below side-by-side.
	 */

	import type { Snippet } from 'svelte';

	interface Props {
		title?: string;
		sidebar?: Snippet;
		mainChart?: Snippet;
		pieChart?: Snippet;
		barChart?: Snippet;
	}

	let {
		title = 'Volve Field Production Analysis',
		sidebar,
		mainChart,
		pieChart,
		barChart
	}: Props = $props();
</script>

<div class="dashboard">
	<header class="dashboard-header">
		<h1>{title}</h1>
	</header>

	<div class="dashboard-content">
		{#if sidebar}
			<aside class="sidebar">
				{@render sidebar()}
			</aside>
		{/if}

		<main class="main-content">
			{#if mainChart}
				<section class="chart-section main-chart" aria-label="Daily Production Chart">
					{@render mainChart()}
				</section>
			{/if}

			<div class="bottom-charts">
				{#if pieChart}
					<section class="chart-section pie-chart" aria-label="Cumulative Production Chart">
						{@render pieChart()}
					</section>
				{/if}

				{#if barChart}
					<section class="chart-section bar-chart" aria-label="Top Wells Chart">
						{@render barChart()}
					</section>
				{/if}
			</div>
		</main>
	</div>
</div>

<style>
	.dashboard {
		display: flex;
		flex-direction: column;
		min-height: 100vh;
		max-width: 1600px;
		margin: 0 auto;
		padding: var(--spacing-md);
	}

	.dashboard-header {
		padding: var(--spacing-md) 0;
		border-bottom: 1px solid var(--color-border);
		margin-bottom: var(--spacing-lg);
	}

	.dashboard-header h1 {
		margin: 0;
		color: var(--color-text);
	}

	.dashboard-content {
		display: grid;
		grid-template-columns: 280px 1fr;
		gap: var(--spacing-lg);
		flex: 1;
	}

	.sidebar {
		position: sticky;
		top: var(--spacing-md);
		height: fit-content;
		max-height: calc(100vh - 120px);
		overflow-y: auto;
	}

	.main-content {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-lg);
	}

	.chart-section {
		background: var(--color-surface);
		border-radius: var(--border-radius);
		padding: var(--spacing-md);
		border: 1px solid var(--color-border);
		transition: box-shadow 0.2s ease, border-color 0.2s ease;
		position: relative;
	}

	.chart-section:hover {
		box-shadow: var(--shadow);
		border-color: var(--color-water);
	}

	.main-chart {
		min-height: 400px;
	}

	.bottom-charts {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--spacing-lg);
	}

	.pie-chart,
	.bar-chart {
		min-height: 350px;
	}

	/* Tablet breakpoint */
	@media (max-width: 1024px) {
		.dashboard-content {
			grid-template-columns: 1fr;
		}

		.sidebar {
			position: static;
			max-height: none;
		}
	}

	/* Mobile breakpoint */
	@media (max-width: 768px) {
		.dashboard {
			padding: var(--spacing-sm);
		}

		.bottom-charts {
			grid-template-columns: 1fr;
		}

		.main-chart {
			min-height: 300px;
		}

		.pie-chart,
		.bar-chart {
			min-height: 300px;
		}
	}
</style>
