<script lang="ts">
	/**
	 * DashboardLayout Component
	 *
	 * Responsive grid layout for the production dashboard.
	 * Features a refined header with tab navigation, GitHub badge and theme toggle.
	 */

	import type { Snippet } from 'svelte';
	import ThemeToggle from './ThemeToggle.svelte';
	import TabNavigation from './TabNavigation.svelte';

	interface Props {
		title?: string;
		activeSection?: string;
		onSectionChange?: (sectionId: string) => void;
		sidebar?: Snippet;
		mainChart?: Snippet;
		rangeSelector?: Snippet;
		pieChart?: Snippet;
		barChart?: Snippet;
	}

	let {
		title = 'Volve Explorer',
		activeSection = 'production',
		onSectionChange,
		sidebar,
		mainChart,
		rangeSelector,
		pieChart,
		barChart
	}: Props = $props();

	// Dataset sections - future sections marked as disabled
	const sections = [
		{ id: 'production', label: 'Production' },
		{ id: 'surveys', label: 'Surveys', disabled: true },
		{ id: 'logs', label: 'Logs', disabled: true },
		{ id: 'core', label: 'Core', disabled: true },
		{ id: 'pvt', label: 'PVT', disabled: true }
	];

	function handleSectionChange(sectionId: string) {
		onSectionChange?.(sectionId);
	}
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
				<h1 class="title">{title}</h1>
			</div>
			<div class="nav-section">
				<TabNavigation
					tabs={sections}
					activeTab={activeSection}
					onTabChange={handleSectionChange}
				/>
			</div>
		</div>

		<div class="header-right">
			<a
				href="https://github.com/oskrgab/volve-explorer"
				class="github-link"
				target="_blank"
				rel="noopener noreferrer"
				aria-label="View on GitHub"
				title="View on GitHub"
			>
				<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
					<path
						fill-rule="evenodd"
						clip-rule="evenodd"
						d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0012 2z"
					/>
				</svg>
			</a>
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
		<div class="footer-left">
			<span class="footer-text">
				Data source: <a href="https://volve-db.ocortez.com" target="_blank" rel="noopener">volve-db</a>
			</span>
		</div>
		<div class="footer-right">
			<span class="author-credit">
				Made with ❤️ by <a href="https://ocortez.com" target="_blank" rel="noopener">Oscar Cortez</a>
			</span>
		</div>
	</footer>
</div>

<style>
	.dashboard {
		display: flex;
		flex-direction: column;
		height: 100vh;
		max-width: 1680px;
		margin: 0 auto;
		padding: 0 var(--spacing-xl);
		overflow: hidden;
	}

	/* Header Styles */
	.dashboard-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--spacing-sm) 0;
		border-bottom: 1px solid var(--color-border);
		background: var(--color-background);
		flex-shrink: 0;
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

	.title {
		font-size: var(--font-size-xl);
		font-weight: 700;
		letter-spacing: -0.03em;
		line-height: 1;
		margin: 0;
		background: linear-gradient(135deg, var(--color-text) 0%, var(--color-text-secondary) 100%);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
		white-space: nowrap;
	}

	.nav-section {
		display: flex;
		align-items: center;
		padding-left: var(--spacing-md);
		border-left: 1px solid var(--color-border);
	}

	.header-right {
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
	}

	.github-link {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		color: var(--color-text-muted);
		border-radius: var(--radius-md);
		transition: all var(--transition-fast);
	}

	.github-link:hover {
		color: var(--color-text);
		background: var(--color-accent-soft);
	}

	.github-link svg {
		width: 20px;
		height: 20px;
	}

	.author-credit {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
		letter-spacing: 0.02em;
	}

	.author-credit a {
		color: var(--color-text-secondary);
		text-decoration: none;
		transition: color var(--transition-base);
	}

	.author-credit a:hover {
		color: var(--color-accent);
	}

	/* Content Layout */
	.dashboard-content {
		display: grid;
		grid-template-columns: 280px 1fr;
		gap: var(--spacing-xl);
		flex: 1;
		overflow: hidden;
		padding-top: var(--spacing-lg);
	}

	.sidebar {
		height: 100%;
		overflow-y: auto;
	}

	.main-content {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-lg);
		overflow-y: auto;
		padding-right: var(--spacing-sm);
	}

	/* Chart Section Styles */
	.chart-section {
		background: var(--color-surface);
		border-radius: var(--radius-lg);
		padding: var(--spacing-lg);
		border: 1px solid var(--color-border);
		transition: box-shadow var(--transition-base), border-color var(--transition-base);
		position: relative;
		box-shadow: var(--shadow-sm);
		flex-shrink: 0;
	}

	.chart-section:hover {
		box-shadow: var(--shadow-md);
		border-color: var(--color-border-strong);
	}

	.main-chart {
		min-height: 520px;
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
		overflow: hidden;
		contain: layout style;
	}

	/* Footer */
	.dashboard-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--spacing-sm) 0;
		border-top: 1px solid var(--color-border);
		flex-wrap: wrap;
		gap: var(--spacing-sm);
		flex-shrink: 0;
		background: var(--color-background);
	}

	.footer-left {
		display: flex;
		align-items: center;
	}

	.footer-right {
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
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
			padding: 0 var(--spacing-md);
		}

		.dashboard-content {
			grid-template-columns: 1fr;
		}

		.sidebar {
			height: auto;
			max-height: 200px;
		}

		.dashboard-header {
			flex-wrap: wrap;
			gap: var(--spacing-md);
		}
	}

	/* Responsive: Mobile */
	@media (max-width: 768px) {
		.dashboard {
			padding: 0 var(--spacing-sm);
		}

		.dashboard-header {
			flex-direction: column;
			align-items: flex-start;
			gap: var(--spacing-sm);
		}

		.header-left {
			flex-direction: column;
			align-items: flex-start;
			gap: var(--spacing-sm);
			width: 100%;
		}

		.nav-section {
			padding-left: 0;
			border-left: none;
			width: 100%;
			overflow-x: auto;
			-webkit-overflow-scrolling: touch;
		}

		.header-right {
			width: 100%;
			justify-content: flex-end;
		}

		.dashboard-footer {
			flex-direction: column;
			align-items: flex-start;
			gap: var(--spacing-md);
		}

		.footer-right {
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
			font-size: var(--font-size-lg);
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
