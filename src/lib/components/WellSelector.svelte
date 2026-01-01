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
		<div class="header-title">
			<svg class="header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<circle cx="12" cy="12" r="3" />
				<path d="M12 2v4m0 12v4M2 12h4m12 0h4" />
				<path d="m4.93 4.93 2.83 2.83m8.48 8.48 2.83 2.83M4.93 19.07l2.83-2.83m8.48-8.48 2.83-2.83" opacity="0.5" />
			</svg>
			<h3 class="title">Wells</h3>
		</div>
		<span class="count">
			{#if selectedCount === 0}
				<span class="status-badge all">All</span>
			{:else}
				<span class="status-badge filtered">{selectedCount}/{wells.length}</span>
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
			<svg viewBox="0 0 16 16" fill="currentColor">
				<path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0Zm3.78 5.97a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0l-2.25-2.25a.75.75 0 1 1 1.06-1.06l1.72 1.72 3.72-3.72a.75.75 0 0 1 1.06 0Z"/>
			</svg>
			Select All
		</button>
		<button
			type="button"
			class="action-btn secondary"
			onclick={handleClearAll}
			disabled={selectedCount === 0}
			aria-label="Clear all selections"
		>
			<svg viewBox="0 0 16 16" fill="currentColor">
				<path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0Zm3.28 5.78a.75.75 0 0 1 0 1.06L9.06 9l2.22 2.22a.75.75 0 1 1-1.06 1.06L8 10.06l-2.22 2.22a.75.75 0 0 1-1.06-1.06L6.94 9 4.72 6.78a.75.75 0 0 1 1.06-1.06L8 7.94l2.22-2.22a.75.75 0 0 1 1.06 0Z"/>
			</svg>
			Clear
		</button>
	</div>

	<div class="well-list" role="group" aria-label="Wells list">
		{#each sortedWells as well (well.id)}
			{@const selected = isWellSelected(well.id)}
			<label
				class="well-item"
				class:selected
			>
				<span class="checkbox-wrapper">
					<input
						type="checkbox"
						checked={selected}
						onchange={() => handleToggle(well.id)}
						aria-label={`Select well ${well.name}`}
					/>
					<svg class="checkmark" viewBox="0 0 16 16" fill="currentColor">
						<path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"/>
					</svg>
				</span>
				<span class="well-info">
					<span class="well-name">{well.name}</span>
					<span class="well-facility">{well.id}</span>
				</span>
			</label>
		{/each}
	</div>
</div>

<style>
	.well-selector {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
		background: var(--color-surface);
		border-radius: var(--radius-lg);
		padding: var(--spacing-lg);
		border: 1px solid var(--color-border);
		box-shadow: var(--shadow-sm);
	}

	.header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.header-title {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.header-icon {
		width: 18px;
		height: 18px;
		color: var(--color-text-muted);
	}

	.title {
		font-size: var(--font-size-base);
		font-weight: 600;
		margin: 0;
		letter-spacing: -0.01em;
	}

	.count {
		font-size: var(--font-size-xs);
	}

	.status-badge {
		display: inline-flex;
		align-items: center;
		padding: 0.125rem 0.5rem;
		border-radius: var(--radius-full);
		font-family: var(--font-mono);
		font-weight: 500;
	}

	.status-badge.all {
		background: var(--color-oil-soft);
		color: var(--color-oil);
	}

	.status-badge.filtered {
		background: var(--color-accent-soft);
		color: var(--color-accent);
	}

	.actions {
		display: flex;
		gap: var(--spacing-sm);
	}

	.action-btn {
		flex: 1;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--spacing-xs);
		padding: var(--spacing-sm) var(--spacing-md);
		background: var(--color-accent-soft);
		border: 1px solid transparent;
		border-radius: var(--radius-md);
		font-size: var(--font-size-sm);
		font-weight: 500;
		color: var(--color-accent);
		transition: all var(--transition-fast);
	}

	.action-btn svg {
		width: 14px;
		height: 14px;
	}

	.action-btn:hover:not(:disabled) {
		background: var(--color-accent);
		color: white;
	}

	.action-btn.secondary {
		background: var(--color-surface-sunken);
		color: var(--color-text-secondary);
	}

	.action-btn.secondary:hover:not(:disabled) {
		background: var(--color-border);
		color: var(--color-text);
	}

	.action-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.well-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
		max-height: 340px;
		overflow-y: auto;
		padding-right: var(--spacing-xs);
		margin-right: calc(-1 * var(--spacing-xs));
	}

	.well-item {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-sm) var(--spacing-md);
		background: var(--color-surface-sunken);
		border-radius: var(--radius-md);
		cursor: pointer;
		transition: all var(--transition-fast);
		border: 1px solid transparent;
	}

	.well-item:hover {
		background: var(--color-accent-soft);
		border-color: var(--color-accent);
	}

	.well-item.selected {
		background: var(--color-accent-soft);
		border-color: var(--color-accent);
	}

	.checkbox-wrapper {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 18px;
		height: 18px;
		flex-shrink: 0;
	}

	.checkbox-wrapper input[type='checkbox'] {
		position: absolute;
		width: 18px;
		height: 18px;
		opacity: 0;
		cursor: pointer;
		margin: 0;
	}

	.checkbox-wrapper::before {
		content: '';
		width: 16px;
		height: 16px;
		border: 2px solid var(--color-border-strong);
		border-radius: var(--radius-sm);
		background: var(--color-surface);
		transition: all var(--transition-fast);
	}

	.well-item.selected .checkbox-wrapper::before {
		background: var(--color-accent);
		border-color: var(--color-accent);
	}

	.checkmark {
		position: absolute;
		width: 12px;
		height: 12px;
		color: white;
		opacity: 0;
		transform: scale(0.5);
		transition: all var(--transition-fast);
	}

	.well-item.selected .checkmark {
		opacity: 1;
		transform: scale(1);
	}

	.well-info {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.well-name {
		font-size: var(--font-size-sm);
		font-weight: 500;
		font-family: var(--font-mono);
		color: var(--color-text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.well-facility {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
	}
</style>
