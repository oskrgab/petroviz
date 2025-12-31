<script lang="ts">
	/**
	 * WellSelector Component
	 *
	 * Multi-select interface for filtering wells.
	 * Includes Select All / Clear Selection buttons.
	 */

	import type { Well } from '$lib/types';
	import {
		dashboardState,
		toggleWellSelection,
		selectAllWells,
		clearWellSelection,
		isWellSelected
	} from '$lib/stores/dashboard.svelte';

	interface Props {
		wells: Well[];
		onSelectionChange?: (selectedIds: number[]) => void;
	}

	let { wells, onSelectionChange }: Props = $props();

	// Get sorted wells for display
	const sortedWells = $derived([...wells].sort((a, b) => a.name.localeCompare(b.name)));

	// Count of selected wells
	const selectedCount = $derived(dashboardState.selectedWellIds.length);

	// Check if all wells are selected
	const allSelected = $derived(
		wells.length > 0 && dashboardState.selectedWellIds.length === wells.length
	);

	function handleToggle(wellId: number) {
		toggleWellSelection(wellId);
		// Use setTimeout to ensure state has updated before callback
		setTimeout(() => onSelectionChange?.(dashboardState.selectedWellIds), 0);
	}

	function handleSelectAll() {
		const allIds = wells.map((w) => w.id);
		selectAllWells(allIds);
		setTimeout(() => onSelectionChange?.(allIds), 0);
	}

	function handleClearAll() {
		clearWellSelection();
		setTimeout(() => onSelectionChange?.([]), 0);
	}
</script>

<div class="well-selector" role="group" aria-label="Well Selection">
	<div class="header">
		<h3 class="title">Wells</h3>
		<span class="count">
			{#if selectedCount === 0}
				All wells (field view)
			{:else}
				{selectedCount} of {wells.length} selected
			{/if}
		</span>
	</div>

	<div class="actions">
		<button
			type="button"
			class="action-btn"
			onclick={handleSelectAll}
			disabled={allSelected}
			aria-label="Select all wells"
		>
			Select All
		</button>
		<button
			type="button"
			class="action-btn"
			onclick={handleClearAll}
			disabled={selectedCount === 0}
			aria-label="Clear all selections"
		>
			Clear
		</button>
	</div>

	<div class="well-list" role="listbox" aria-multiselectable="true">
		{#each sortedWells as well (well.id)}
			{@const selected = isWellSelected(well.id)}
			<label
				class="well-item"
				class:selected
				role="option"
				aria-selected={selected}
			>
				<input
					type="checkbox"
					checked={selected}
					onchange={() => handleToggle(well.id)}
					aria-label={`Select well ${well.name}`}
				/>
				<span class="well-name">{well.name}</span>
				{#if well.facility}
					<span class="well-facility">{well.facility}</span>
				{/if}
			</label>
		{/each}
	</div>
</div>

<style>
	.well-selector {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
		background: var(--color-surface);
		border-radius: var(--border-radius);
		padding: var(--spacing-md);
		border: 1px solid var(--color-border);
	}

	.header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.title {
		font-size: var(--font-size-lg);
		margin: 0;
	}

	.count {
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
	}

	.actions {
		display: flex;
		gap: var(--spacing-sm);
	}

	.action-btn {
		flex: 1;
		padding: var(--spacing-xs) var(--spacing-sm);
		background: var(--color-background);
		border: 1px solid var(--color-border);
		border-radius: calc(var(--border-radius) / 2);
		font-size: var(--font-size-sm);
		color: var(--color-text);
		transition: background-color 0.15s, border-color 0.15s;
	}

	.action-btn:hover:not(:disabled) {
		background: var(--color-surface);
		border-color: var(--color-water);
	}

	.action-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.well-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
		max-height: 300px;
		overflow-y: auto;
		padding-right: var(--spacing-xs);
	}

	.well-item {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-xs) var(--spacing-sm);
		background: var(--color-background);
		border-radius: calc(var(--border-radius) / 2);
		cursor: pointer;
		transition: background-color 0.15s;
	}

	.well-item:hover {
		background: rgba(52, 152, 219, 0.1);
	}

	.well-item.selected {
		background: rgba(52, 152, 219, 0.15);
		border-left: 3px solid var(--color-water);
	}

	.well-item input[type="checkbox"] {
		width: 16px;
		height: 16px;
		accent-color: var(--color-water);
	}

	.well-name {
		flex: 1;
		font-size: var(--font-size-sm);
		font-weight: 500;
	}

	.well-facility {
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
	}

	/* Scrollbar styling */
	.well-list::-webkit-scrollbar {
		width: 6px;
	}

	.well-list::-webkit-scrollbar-track {
		background: var(--color-surface);
		border-radius: 3px;
	}

	.well-list::-webkit-scrollbar-thumb {
		background: var(--color-border);
		border-radius: 3px;
	}

	.well-list::-webkit-scrollbar-thumb:hover {
		background: var(--color-text-secondary);
	}
</style>
