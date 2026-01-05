<script lang="ts">
	/**
	 * DashboardLayout Component
	 *
	 * Responsive grid layout for the production dashboard.
	 * On desktop: traditional sidebar layout with WellSelector always visible.
	 * On smaller screens: vertical side tabs with flyout panels.
	 */

	import type { Snippet } from 'svelte';
	import { slide } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { MediaQuery } from 'svelte/reactivity';
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
		activeSection = 'dashboards',
		onSectionChange,
		sidebar,
		mainChart,
		rangeSelector,
		pieChart,
		barChart
	}: Props = $props();

	// Responsive: detect when to show side tabs vs traditional sidebar
	const isCompactMode = new MediaQuery('(max-width: 1023px)');

	// Side panel state - which panel is open (null = none)
	type PanelId = 'wells' | 'filter1' | 'filter2' | null;
	let activePanel = $state<PanelId>(null);

	function togglePanel(panelId: PanelId) {
		if (activePanel === panelId) {
			activePanel = null;
		} else {
			activePanel = panelId;
		}
	}

	function closePanel() {
		activePanel = null;
	}

	// Close panel when switching back to desktop mode
	$effect(() => {
		if (!isCompactMode.current) {
			activePanel = null;
		}
	});

	// Reference to the flyout panel for click-outside detection
	let flyoutPanelRef: HTMLElement | null = $state(null);

	// Click-outside detection - closes panel when clicking outside
	$effect(() => {
		if (activePanel === null || !flyoutPanelRef) return;

		function handleClickOutside(event: MouseEvent) {
			const target = event.target as Node;

			// Check if click is outside the panel and not on a side tab
			const isOutsidePanel = flyoutPanelRef && !flyoutPanelRef.contains(target);
			const isOnSideTab = (target as Element).closest?.('.side-tab');

			if (isOutsidePanel && !isOnSideTab) {
				closePanel();
			}
		}

		// Add listener with a small delay to avoid immediate close on the opening click
		const timeoutId = setTimeout(() => {
			document.addEventListener('click', handleClickOutside);
		}, 10);

		return () => {
			clearTimeout(timeoutId);
			document.removeEventListener('click', handleClickOutside);
		};
	});

	// Side tabs configuration (only shown in compact mode)
	const sideTabs = [
		{ id: 'wells' as const, label: 'Wells', icon: 'wells' },
		// Future filter tabs - currently disabled
		// { id: 'filter1' as const, label: 'Date Filter', icon: 'calendar', disabled: true },
		// { id: 'filter2' as const, label: 'Parameters', icon: 'settings', disabled: true },
	];

	// Dataset sections
	const sections = [
		{ id: 'dashboards', label: 'DASHBOARDS' },
		{ id: 'analysis', label: 'ANALYSIS', disabled: true },
		{ id: 'export', label: 'EXPORT', disabled: true }
	];

	function handleSectionChange(sectionId: string) {
		onSectionChange?.(sectionId);
	}
</script>

<div class="dashboard" class:compact-mode={isCompactMode.current}>
	<!-- Vertical Side Tabs (compact mode only) -->
	{#if isCompactMode.current}
		<div class="side-tabs">
			{#each sideTabs as tab (tab.id)}
				<button
					class="side-tab"
					class:active={activePanel === tab.id}
					onclick={() => togglePanel(tab.id)}
					aria-label={`${activePanel === tab.id ? 'Close' : 'Open'} ${tab.label} panel`}
					aria-expanded={activePanel === tab.id}
				>
					<span class="side-tab-label">{tab.label}</span>
				</button>
			{/each}
		</div>

		<!-- Flyout Panel (compact mode only) -->
		{#if activePanel !== null}
			<!-- Panel Container - minimal, just content -->
			<aside
				class="flyout-panel"
				bind:this={flyoutPanelRef}
				transition:slide={{ duration: 200, easing: cubicOut, axis: 'x' }}
			>
				{#if activePanel === 'wells' && sidebar}
					{@render sidebar()}
				{:else if activePanel === 'filter1'}
					<p class="placeholder-text">Date filter coming soon...</p>
				{:else if activePanel === 'filter2'}
					<p class="placeholder-text">Parameters coming soon...</p>
				{/if}
			</aside>
		{/if}
	{/if}

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
		<!-- Traditional sidebar (desktop only) -->
		{#if sidebar && !isCompactMode.current}
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

	/* Compact mode: add left padding for side tabs */
	.dashboard.compact-mode {
		padding-left: calc(var(--spacing-xl) + 36px);
	}

	/* ==================== SIDE TABS (compact mode only) ==================== */
	.side-tabs {
		position: fixed;
		left: 0;
		top: 50%;
		transform: translateY(-50%);
		display: flex;
		flex-direction: column;
		gap: 2px;
		z-index: 50;
	}

	.side-tab {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 32px;
		height: auto;
		min-height: 75px;
		padding: var(--spacing-sm) 0;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-left: none;
		border-radius: 0 var(--radius-md) var(--radius-md) 0;
		cursor: pointer;
		transition: all var(--transition-base);
		writing-mode: vertical-rl;
		text-orientation: mixed;
		flex-direction: column;
		gap: var(--spacing-xs);
		box-shadow: var(--shadow-sm);
		color: var(--color-text);
	}

	.side-tab:hover {
		background: var(--color-surface-sunken);
		border-color: var(--color-border-strong);
		width: 36px;
	}

	.side-tab.active {
		background: var(--color-surface-sunken);
		border-color: var(--color-border-strong);
		width: 36px;
		box-shadow: var(--shadow-md);
	}

	.side-tab-label {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		white-space: nowrap;
		transform: rotate(180deg);
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--spacing-sm) 4px;
	}

	/* ==================== FLYOUT PANEL ==================== */

	.flyout-panel {
		position: fixed;
		top: var(--spacing-xl);
		left: calc(36px + var(--spacing-sm));
		max-height: calc(100vh - var(--spacing-xl) * 2);
		width: min(300px, calc(100vw - 80px));
		z-index: 70;
		overflow-y: auto;
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-lg), 0 0 0 1px var(--color-border);
	}

	.placeholder-text {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
		text-align: center;
		padding: var(--spacing-xl);
		background: var(--color-surface);
		border-radius: var(--radius-lg);
	}

	/* ==================== HEADER ==================== */
	.dashboard-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--spacing-sm) 0;
		border-bottom: 1px solid var(--color-border);
		background: var(--color-background);
		flex-shrink: 0;
		gap: var(--spacing-sm);
		min-height: 60px;
	}

	.header-left {
		display: flex;
		align-items: center;
		gap: var(--spacing-lg);
		flex: 1;
		min-width: 0;
		overflow: hidden;
	}

	.logo-section {
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
		flex-shrink: 0;
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
		flex-shrink: 0;
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
		flex: 1;
		min-width: 0;
		overflow: visible;
	}

	.header-right {
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
		flex-shrink: 0;
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
		flex-shrink: 0;
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

	/* ==================== CONTENT LAYOUT ==================== */
	.dashboard-content {
		display: grid;
		grid-template-columns: 280px 1fr;
		gap: var(--spacing-xl);
		flex: 1;
		overflow: hidden;
		padding-top: var(--spacing-lg);
	}

	/* Compact mode: single column layout */
	.compact-mode .dashboard-content {
		grid-template-columns: 1fr;
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

	/* ==================== CHART SECTIONS ==================== */
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

	/* ==================== FOOTER ==================== */
	.dashboard-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--spacing-sm) 0;
		border-top: 1px solid var(--color-border);
		gap: var(--spacing-md);
		flex-shrink: 0;
		background: var(--color-background);
		min-height: 48px;
	}

	.footer-left {
		display: flex;
		align-items: center;
		flex-shrink: 1;
		min-width: 0;
	}

	.footer-right {
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
		flex-shrink: 1;
		min-width: 0;
	}

	.footer-text {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.footer-text a {
		color: var(--color-accent);
		font-weight: 500;
	}

	/* ==================== RESPONSIVE: TABLET ==================== */
	@media (max-width: 1024px) {
		.dashboard {
			padding: 0 var(--spacing-md);
		}

		.dashboard.compact-mode {
			padding-left: calc(var(--spacing-md) + 36px);
		}

		.header-left {
			gap: var(--spacing-md);
		}

		.flyout-panel {
			left: calc(36px + var(--spacing-xs));
			width: min(300px, calc(100vw - 60px));
		}
	}

	/* ==================== RESPONSIVE: MOBILE ==================== */
	@media (max-width: 768px) {
		.dashboard {
			padding: 0 var(--spacing-sm);
		}

		.dashboard.compact-mode {
			padding-left: calc(var(--spacing-sm) + 32px);
		}

		.header-left {
			gap: var(--spacing-sm);
		}

		.logo-section {
			gap: var(--spacing-sm);
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

		.footer-text,
		.author-credit {
			font-size: var(--font-size-xs);
		}

		/* Smaller side tabs on mobile */
		.side-tab {
			width: 28px;
			min-height: 80px;
			padding: var(--spacing-sm) var(--spacing-xs);
		}

		.side-tab:hover,
		.side-tab.active {
			width: 32px;
		}

		.side-tab-label {
			font-size: 10px;
		}

		.flyout-panel {
			left: calc(28px + var(--spacing-xs));
			width: min(280px, calc(100vw - 50px));
		}
	}

	/* ==================== RESPONSIVE: SMALL MOBILE ==================== */
	@media (max-width: 480px) {
		.chart-section {
			padding: var(--spacing-md);
		}

		.range-selector {
			padding: var(--spacing-sm) var(--spacing-md);
		}

		.title {
			font-size: var(--font-size-md);
		}

		.header-left {
			gap: var(--spacing-xs);
		}

		.nav-section {
			padding-left: var(--spacing-xs);
			border-left: none;
		}

		.logo-section {
			gap: var(--spacing-xs);
		}

		.logo-icon {
			width: 32px;
			height: 32px;
		}

		.logo-icon svg {
			width: 18px;
			height: 18px;
		}

		.github-link {
			width: 28px;
			height: 28px;
		}

		.github-link svg {
			width: 16px;
			height: 16px;
		}
	}
</style>
