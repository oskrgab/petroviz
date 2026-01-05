<script lang="ts">
	/**
	 * TabNavigation Component
	 *
	 * Industrial-style tab navigation for switching between dataset sections.
	 * Designed with a technical/scientific aesthetic using monospace typography
	 * and precise underline indicators.
	 *
	 * Features responsive behavior: shows all tabs when space allows, or collapses
	 * to first tab + dropdown menu when space is limited.
	 */

	import { onMount } from 'svelte';

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

	// Responsive state
	let showDropdown = $state(false);
	let isCompact = $state(false);
	let containerRef: HTMLDivElement | null = $state(null);
	let dropdownRef: HTMLDivElement | null = $state(null);

	function handleTabClick(tab: Tab) {
		if (tab.disabled) return;
		onTabChange?.(tab.id);
		showDropdown = false;
	}

	function handleKeyDown(event: KeyboardEvent, tab: Tab) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			handleTabClick(tab);
		}
	}

	function toggleDropdown() {
		showDropdown = !showDropdown;
	}

	// Calculate indicator position based on active tab
	let activeIndex = $derived(tabs.findIndex(t => t.id === activeTab));

	// Visible tabs (first tab or all tabs depending on compact mode)
	let visibleTabs = $derived(isCompact ? [tabs[0]] : tabs);
	let dropdownTabs = $derived(isCompact ? tabs.slice(1) : []);

	// Check if we need compact mode based on available width
	function checkCompactMode() {
		if (!containerRef) return;

		const containerWidth = containerRef.offsetWidth;
		// Rough estimate: each tab is ~100px, dropdown button is ~40px
		const estimatedTabsWidth = tabs.length * 100;
		const needsCompact = containerWidth < estimatedTabsWidth;

		isCompact = needsCompact;
	}

	// Close dropdown when clicking outside
	$effect(() => {
		if (!showDropdown) return;

		function handleClickOutside(event: MouseEvent) {
			const target = event.target as Node;
			if (dropdownRef && !dropdownRef.contains(target) &&
			    containerRef && !containerRef.contains(target)) {
				showDropdown = false;
			}
		}

		const timeoutId = setTimeout(() => {
			document.addEventListener('click', handleClickOutside);
		}, 10);

		return () => {
			clearTimeout(timeoutId);
			document.removeEventListener('click', handleClickOutside);
		};
	});

	onMount(() => {
		// Initial check
		checkCompactMode();

		// Watch for resize
		const resizeObserver = new ResizeObserver(() => {
			checkCompactMode();
		});

		if (containerRef) {
			resizeObserver.observe(containerRef);
		}

		return () => {
			resizeObserver.disconnect();
		};
	});
</script>

<div class="tab-navigation" role="tablist" aria-label="Dataset sections" bind:this={containerRef}>
	<div class="tabs-container">
		{#each visibleTabs as tab (tab.id)}
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

		{#if isCompact}
			<button
				class="dropdown-toggle"
				onclick={toggleDropdown}
				aria-label="More sections"
				aria-expanded={showDropdown}
			>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<polyline points="9 6 15 12 9 18" />
					<polyline points="15 6 21 12 15 18" />
				</svg>
			</button>

			{#if showDropdown}
				<div class="dropdown-menu" bind:this={dropdownRef}>
					{#each dropdownTabs as tab (tab.id)}
						<button
							class="dropdown-item"
							class:active={activeTab === tab.id}
							class:disabled={tab.disabled}
							disabled={tab.disabled}
							onclick={() => handleTabClick(tab)}
						>
							<span class="tab-label">{tab.label}</span>
							{#if tab.disabled}
								<span class="tab-badge">Soon</span>
							{/if}
						</button>
					{/each}
				</div>
			{/if}
		{/if}
	</div>
</div>

<style>
	.tab-navigation {
		display: flex;
		align-items: center;
		flex: 1;
		min-width: 0;
	}

	.tabs-container {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
		position: relative;
		flex: 1;
		min-width: 0;
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

	/* Dropdown toggle button (chevron) */
	.dropdown-toggle {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		padding: 0;
		background: transparent;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		color: var(--color-text-muted);
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.dropdown-toggle:hover {
		color: var(--color-text);
		background: var(--color-accent-soft);
		border-color: var(--color-border-strong);
	}

	.dropdown-toggle svg {
		width: 16px;
		height: 16px;
	}

	/* Dropdown menu */
	.dropdown-menu {
		position: absolute;
		top: calc(100% + 8px);
		left: 0;
		min-width: 200px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-lg);
		overflow: hidden;
		z-index: 100;
		animation: slideDown var(--transition-fast) ease-out;
	}

	@keyframes slideDown {
		from {
			opacity: 0;
			transform: translateY(-8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.dropdown-item {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
		width: 100%;
		padding: var(--spacing-sm) var(--spacing-md);
		font-family: var(--font-mono);
		font-size: var(--font-size-xs);
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		text-align: left;
		color: var(--color-text-muted);
		background: transparent;
		border: none;
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.dropdown-item:hover:not(:disabled) {
		color: var(--color-text);
		background: var(--color-accent-soft);
	}

	.dropdown-item.active {
		color: var(--color-accent);
		background: var(--color-accent-soft);
	}

	.dropdown-item:disabled {
		cursor: not-allowed;
		opacity: 0.5;
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

		.dropdown-toggle {
			width: 28px;
			height: 28px;
		}

		.dropdown-toggle svg {
			width: 14px;
			height: 14px;
		}
	}
</style>
