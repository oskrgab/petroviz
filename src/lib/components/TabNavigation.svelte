<script lang="ts">
	/**
	 * TabNavigation Component
	 *
	 * Industrial-style tab navigation for switching between dataset sections.
	 * Designed with a technical/scientific aesthetic using monospace typography
	 * and precise underline indicators.
	 */

	interface Tab {
		id: string;
		label: string;
		disabled?: boolean;
	}

	interface Props {
		tabs: Tab[];
		activeTab: string;
		onTabChange?: (tabId: string) => void;
	}

	let { tabs, activeTab, onTabChange }: Props = $props();

	function handleTabClick(tab: Tab) {
		if (tab.disabled) return;
		onTabChange?.(tab.id);
	}

	function handleKeyDown(event: KeyboardEvent, tab: Tab) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			handleTabClick(tab);
		}
	}

	// Calculate indicator position based on active tab
	let activeIndex = $derived(tabs.findIndex(t => t.id === activeTab));
</script>

<div class="tab-navigation" role="tablist" aria-label="Dataset sections">
	<div class="tabs-container">
		{#each tabs as tab, index (tab.id)}
			<button
				role="tab"
				aria-selected={activeTab === tab.id}
				aria-disabled={tab.disabled}
				class="tab"
				class:active={activeTab === tab.id}
				class:disabled={tab.disabled}
				tabindex={activeTab === tab.id ? 0 : -1}
				onclick={() => handleTabClick(tab)}
				onkeydown={(e) => handleKeyDown(e, tab)}
			>
				<span class="tab-label">{tab.label}</span>
				{#if tab.disabled}
					<span class="tab-badge">Soon</span>
				{/if}
			</button>
		{/each}

		<!-- Sliding indicator -->
		<div
			class="tab-indicator"
			style="--active-index: {activeIndex}; --tab-count: {tabs.length};"
		></div>
	</div>
</div>

<style>
	.tab-navigation {
		display: flex;
		align-items: center;
	}

	.tabs-container {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
		position: relative;
	}

	.tab {
		position: relative;
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
		padding: var(--spacing-xs) var(--spacing-sm);
		font-family: var(--font-mono);
		font-size: var(--font-size-xs);
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-text-muted);
		background: transparent;
		border: none;
		border-radius: var(--radius-sm);
		cursor: pointer;
		transition: all var(--transition-fast);
		white-space: nowrap;
	}

	.tab:hover:not(.disabled) {
		color: var(--color-text-secondary);
		background: var(--color-accent-soft);
	}

	.tab:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: 2px;
	}

	.tab.active {
		color: var(--color-accent);
	}

	.tab.active .tab-label {
		font-weight: 600;
	}

	.tab.disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}

	.tab-label {
		position: relative;
	}

	.tab-badge {
		font-size: 0.625rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding: 1px 4px;
		background: var(--color-surface-sunken);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		color: var(--color-text-muted);
	}

	/* Active indicator line */
	.tab.active::after {
		content: '';
		position: absolute;
		bottom: -2px;
		left: var(--spacing-sm);
		right: var(--spacing-sm);
		height: 2px;
		background: var(--color-accent);
		border-radius: 1px;
		animation: slideIn var(--transition-fast) ease-out;
	}

	@keyframes slideIn {
		from {
			transform: scaleX(0);
			opacity: 0;
		}
		to {
			transform: scaleX(1);
			opacity: 1;
		}
	}

	/* Responsive: hide badges on small screens */
	@media (max-width: 480px) {
		.tab {
			padding: var(--spacing-xs);
			font-size: 0.6875rem;
		}

		.tab-badge {
			display: none;
		}
	}
</style>
