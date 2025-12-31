<script lang="ts">
	/**
	 * DashboardLayout Component
	 *
	 * Responsive grid layout for the production dashboard.
	 * Features a refined header with GitHub badge and theme toggle.
	 */

	import type { Snippet } from 'svelte';
	import GitHubBadge from './GitHubBadge.svelte';
	import ThemeToggle from './ThemeToggle.svelte';

	interface Props {
		title?: string;
		subtitle?: string;
		sidebar?: Snippet;
		mainChart?: Snippet;
		rangeSelector?: Snippet;
		pieChart?: Snippet;
		barChart?: Snippet;
	}

	let {
		title = 'Volve Field',
		subtitle = 'Production Analysis',
		sidebar,
		mainChart,
		rangeSelector,
		pieChart,
		barChart
	}: Props = $props();
</script>

<div class="dashboard">
	<header class="dashboard-header">
		<div class="header-left">
			<div class="logo-section">
				<!-- Oil drop icon -->
				<div class="logo-icon">
					<svg viewBox="0 0 24 24" fill="currentColor">
						<path d="M12 2C12 2 5 10 5 15C5 18.866 8.134 22 12 22C15.866 22 19 18.866 19 15C19 10 12 2 12 2ZM12 20C9.239 20 7 17.761 7 15C7 11.512 11 5.695 12 4.357C13 5.695 17 11.512 17 15C17 17.761 14.761 20 12 20Z"/>
						<ellipse cx="12" cy="15" rx="4" ry="5" fill="currentColor" opacity="0.3"/>
					</svg>
				</div>
				<div class="title-group">
					<h1 class="title">{title}</h1>
					<span class="subtitle">{subtitle}</span>
				</div>
			</div>
		</div>

		<div class="header-right">
			<GitHubBadge />
			<ThemeToggle />
		</div>
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

			{#if rangeSelector}
				<section class="chart-section range-selector" aria-label="Date Range Selector">
					{@render rangeSelector()}
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

	<footer class="dashboard-footer">
		<span class="footer-text">
			Data source: <a href="https://www.equinor.com/energy/volve-data-sharing" target="_blank" rel="noopener">Volve Dataset</a> by Equinor
		</span>
	</footer>
</div>

<style>
	.dashboard {
		display: flex;
		flex-direction: column;
		min-height: 100vh;
		max-width: 1680px;
		margin: 0 auto;
		padding: var(--spacing-lg) var(--spacing-xl);
	}

	/* Header Styles */
	.dashboard-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding-bottom: var(--spacing-lg);
		margin-bottom: var(--spacing-xl);
		border-bottom: 1px solid var(--color-border);
	}

	.header-left {
		display: flex;
		align-items: center;
		gap: var(--spacing-lg);
	}

	.logo-section {
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
	}

	.logo-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
		background: linear-gradient(135deg, var(--color-oil) 0%, var(--color-oil-soft) 100%);
		border-radius: var(--radius-lg);
		color: white;
		box-shadow: var(--shadow-md);
	}

	.logo-icon svg {
		width: 26px;
		height: 26px;
	}

	.title-group {
		display: flex;
		flex-direction: column;
		gap: 0;
	}

	.title {
		font-size: var(--font-size-2xl);
		font-weight: 700;
		letter-spacing: -0.03em;
		line-height: 1.1;
		margin: 0;
		background: linear-gradient(135deg, var(--color-text) 0%, var(--color-text-secondary) 100%);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	.subtitle {
		font-size: var(--font-size-sm);
		font-weight: 500;
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.header-right {
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
	}

	/* Content Layout */
	.dashboard-content {
		display: grid;
		grid-template-columns: 280px 1fr;
		gap: var(--spacing-xl);
		flex: 1;
	}

	.sidebar {
		position: sticky;
		top: var(--spacing-lg);
		height: fit-content;
		max-height: calc(100vh - 140px);
		overflow-y: auto;
	}

	.main-content {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-lg);
	}

	/* Chart Section Styles */
	.chart-section {
		background: var(--color-surface);
		border-radius: var(--radius-lg);
		padding: var(--spacing-lg);
		border: 1px solid var(--color-border);
		transition: all var(--transition-base);
		position: relative;
		box-shadow: var(--shadow-sm);
	}

	.chart-section:hover {
		box-shadow: var(--shadow-md);
		border-color: var(--color-border-strong);
	}

	.main-chart {
		min-height: 420px;
	}

	.range-selector {
		min-height: auto;
		padding: var(--spacing-md) var(--spacing-lg);
	}

	.bottom-charts {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--spacing-lg);
	}

	.pie-chart,
	.bar-chart {
		min-height: 360px;
	}

	/* Footer */
	.dashboard-footer {
		margin-top: var(--spacing-2xl);
		padding-top: var(--spacing-lg);
		border-top: 1px solid var(--color-border);
		text-align: center;
	}

	.footer-text {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}

	.footer-text a {
		color: var(--color-accent);
		font-weight: 500;
	}

	/* Responsive: Tablet */
	@media (max-width: 1024px) {
		.dashboard {
			padding: var(--spacing-md);
		}

		.dashboard-content {
			grid-template-columns: 1fr;
		}

		.sidebar {
			position: static;
			max-height: none;
		}

		.dashboard-header {
			flex-wrap: wrap;
			gap: var(--spacing-md);
		}
	}

	/* Responsive: Mobile */
	@media (max-width: 768px) {
		.dashboard {
			padding: var(--spacing-sm);
		}

		.dashboard-header {
			flex-direction: column;
			align-items: flex-start;
			gap: var(--spacing-md);
		}

		.header-right {
			width: 100%;
			justify-content: space-between;
		}

		.bottom-charts {
			grid-template-columns: 1fr;
		}

		.main-chart {
			min-height: 320px;
		}

		.pie-chart,
		.bar-chart {
			min-height: 300px;
		}

		.logo-icon {
			width: 38px;
			height: 38px;
		}

		.logo-icon svg {
			width: 22px;
			height: 22px;
		}

		.title {
			font-size: var(--font-size-xl);
		}
	}

	/* Responsive: Small Mobile */
	@media (max-width: 480px) {
		.chart-section {
			padding: var(--spacing-md);
		}

		.range-selector {
			padding: var(--spacing-sm) var(--spacing-md);
		}
	}
</style>
