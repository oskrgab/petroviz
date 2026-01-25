<script lang="ts">
  /**
   * WellSelector Component
   *
   * Multi-select interface for filtering wells with configurable identifiers.
   * Features a table-like layout with resizable columns.
   */

  import type { Well } from "$lib/types";
  import {
    dashboardState,
    toggleWellSelection,
    selectAllWells,
    clearWellSelection,
    isWellSelected,
  } from "$lib/stores/dashboard.svelte";

  interface Props {
    wells: Well[];
    onSelectionChange?: (selectedIds: number[]) => void;
  }

  let { wells, onSelectionChange }: Props = $props();

  // Column options derived from Well interface keys
  const columnOptions = [
    { value: "name", label: "Well Name" },
    { value: "id", label: "NPD Code" },
    { value: "field", label: "Field" },
    { value: "facility", label: "Facility" },
  ] as const;

  type ColumnKey = (typeof columnOptions)[number]["value"];

  // State for identifier columns
  let primaryIdentifier = $state<ColumnKey>("name");
  let secondaryIdentifier = $state<ColumnKey>("id");

  // Resizable column widths (percentages)
  let primaryColumnWidth = $state(60);
  let isResizing = $state(false);

  // Get sorted wells for display
  const sortedWells = $derived(
    [...wells].sort((a, b) => {
      const aVal = getWellValue(a, primaryIdentifier);
      const bVal = getWellValue(b, primaryIdentifier);
      return String(aVal).localeCompare(String(bVal));
    }),
  );

  // Count of selected wells
  const selectedCount = $derived(dashboardState.selectedWellIds.length);

  // Check if all wells are selected
  const allSelected = $derived(
    wells.length > 0 && dashboardState.selectedWellIds.length === wells.length,
  );

  // Check if some (but not all) wells are selected - for indeterminate state
  const someSelected = $derived(
    selectedCount > 0 && selectedCount < wells.length,
  );

  // Reference to the select-all checkbox for indeterminate state
  let selectAllCheckbox: HTMLInputElement | undefined = $state();

  // Set indeterminate state when someSelected changes
  $effect(() => {
    if (selectAllCheckbox) {
      selectAllCheckbox.indeterminate = someSelected;
    }
  });

  function getWellValue(well: Well, key: ColumnKey): string | number {
    const value = well[key];
    return value ?? "—";
  }

  function handleToggle(wellId: number) {
    toggleWellSelection(wellId);
    setTimeout(() => onSelectionChange?.(dashboardState.selectedWellIds), 0);
  }

  function handleSelectAllToggle() {
    if (allSelected || someSelected) {
      // If all or some selected, clear all
      clearWellSelection();
      setTimeout(() => onSelectionChange?.([]), 0);
    } else {
      // If none selected, select all
      const allIds = wells.map((w) => w.id);
      selectAllWells(allIds);
      setTimeout(() => onSelectionChange?.(allIds), 0);
    }
  }

  // Column resize handling
  function startResize(e: MouseEvent) {
    e.preventDefault();
    isResizing = true;

    const startX = e.clientX;
    const startWidth = primaryColumnWidth;
    const container = (e.target as HTMLElement).closest(".well-table-header");
    const containerWidth = container?.clientWidth ?? 300;

    function onMouseMove(e: MouseEvent) {
      const deltaX = e.clientX - startX;
      const deltaPercent = (deltaX / containerWidth) * 100;
      const newWidth = Math.min(Math.max(startWidth + deltaPercent, 25), 75);
      primaryColumnWidth = newWidth;
    }

    function onMouseUp() {
      isResizing = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }
</script>

<div class="well-selector" role="group" aria-label="Well Selection">
  <div class="header">
    <div class="header-title">
      <svg
        class="header-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v4m0 12v4M2 12h4m12 0h4" />
        <path
          d="m4.93 4.93 2.83 2.83m8.48 8.48 2.83 2.83M4.93 19.07l2.83-2.83m8.48-8.48 2.83-2.83"
          opacity="0.5"
        />
      </svg>
      <h3 class="title">Wells</h3>
    </div>
    <span class="count">
      {#if selectedCount === 0}
        <span class="status-badge all">All</span>
      {:else}
        <span class="status-badge filtered">{selectedCount}/{wells.length}</span
        >
      {/if}
    </span>
  </div>

  <!-- Consolidated table header with select-all and column dropdowns -->
  <div class="well-table-header" class:resizing={isResizing}>
    <div class="th-checkbox">
      <span class="checkbox-container">
        <input
          type="checkbox"
          bind:this={selectAllCheckbox}
          checked={allSelected}
          onchange={handleSelectAllToggle}
          aria-label="Select all wells"
        />
        <svg class="checkmark" viewBox="0 0 16 16" fill="currentColor">
          <path
            d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"
          />
        </svg>
        <svg class="indeterminate-mark" viewBox="0 0 16 16" fill="currentColor">
          <path
            d="M4 8a.75.75 0 0 1 .75-.75h6.5a.75.75 0 0 1 0 1.5h-6.5A.75.75 0 0 1 4 8Z"
          />
        </svg>
      </span>
    </div>
    <div class="th-primary" style="width: {primaryColumnWidth}%">
      <select
        id="primary-identifier"
        class="header-dropdown"
        bind:value={primaryIdentifier}
        aria-label="Primary column"
      >
        {#each columnOptions as option (option.value)}
          <option value={option.value}>{option.label}</option>
        {/each}
      </select>
      <button
        type="button"
        class="resize-handle"
        onmousedown={startResize}
        aria-label="Resize columns"
      >
        <span class="resize-grip"></span>
      </button>
    </div>
    <div class="th-secondary" style="width: {100 - primaryColumnWidth}%">
      <select
        id="secondary-identifier"
        class="header-dropdown"
        bind:value={secondaryIdentifier}
        aria-label="Secondary column"
      >
        {#each columnOptions as option (option.value)}
          <option value={option.value}>{option.label}</option>
        {/each}
      </select>
    </div>
  </div>

  <!-- Well list as table rows -->
  <div class="well-list" role="group" aria-label="Wells list">
    {#each sortedWells as well (well.id)}
      {@const selected = isWellSelected(well.id)}
      <label class="well-row" class:selected>
        <span class="cell-checkbox">
          <span class="checkbox-wrapper">
            <input
              type="checkbox"
              checked={selected}
              onchange={() => handleToggle(well.id)}
              aria-label={`Select well ${well.name}`}
            />
            <svg class="checkmark" viewBox="0 0 16 16" fill="currentColor">
              <path
                d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"
              />
            </svg>
          </span>
        </span>
        <span class="cell-primary" style="width: {primaryColumnWidth}%">
          {getWellValue(well, primaryIdentifier)}
        </span>
        <span class="cell-secondary" style="width: {100 - primaryColumnWidth}%">
          {getWellValue(well, secondaryIdentifier)}
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

  /* Header checkbox container */
  .checkbox-container {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    flex-shrink: 0;
    cursor: pointer;
  }

  .checkbox-container input[type="checkbox"] {
    position: absolute;
    width: 18px;
    height: 18px;
    opacity: 0;
    cursor: pointer;
    margin: 0;
    z-index: 1;
  }

  .checkbox-container::before {
    content: "";
    width: 16px;
    height: 16px;
    border: 2px solid var(--color-border-strong);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    transition: all var(--transition-fast);
  }

  .checkbox-container:hover::before {
    border-color: var(--color-accent);
  }

  .checkbox-container input:checked + .checkmark + .indeterminate-mark,
  .checkbox-container:has(input:checked)::before {
    background: var(--color-accent);
    border-color: var(--color-accent);
  }

  .checkbox-container input:indeterminate + .checkmark + .indeterminate-mark {
    opacity: 1;
    transform: scale(1);
  }

  .checkbox-container:has(input:indeterminate)::before {
    background: var(--color-accent);
    border-color: var(--color-accent);
  }

  .checkbox-container .checkmark {
    position: absolute;
    width: 12px;
    height: 12px;
    color: white;
    opacity: 0;
    transform: scale(0.5);
    transition: all var(--transition-fast);
    pointer-events: none;
  }

  .checkbox-container input:checked + .checkmark {
    opacity: 1;
    transform: scale(1);
  }

  .checkbox-container input:indeterminate + .checkmark {
    opacity: 0;
  }

  .checkbox-container .indeterminate-mark {
    position: absolute;
    width: 12px;
    height: 12px;
    color: white;
    opacity: 0;
    transform: scale(0.5);
    transition: all var(--transition-fast);
    pointer-events: none;
  }

  /* Table header */
  .well-table-header {
    display: flex;
    align-items: center;
    padding: var(--spacing-sm) 0;
    border-bottom: 1px solid var(--color-border);
    user-select: none;
    gap: var(--spacing-xs);
  }

  .well-table-header.resizing {
    cursor: col-resize;
  }

  .th-checkbox {
    width: 32px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .th-primary,
  .th-secondary {
    display: flex;
    align-items: center;
    min-width: 0;
  }

  .th-primary {
    position: relative;
    padding-right: var(--spacing-sm);
  }

  /* Header dropdown - serves as both column selector and label */
  .header-dropdown {
    appearance: none;
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    padding: var(--spacing-xs) var(--spacing-lg) var(--spacing-xs)
      var(--spacing-xs);
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-muted);
    cursor: pointer;
    transition: all var(--transition-fast);
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 4px center;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .header-dropdown:hover {
    background-color: var(--color-surface-sunken);
    border-color: var(--color-border);
    color: var(--color-text);
  }

  .header-dropdown:focus {
    outline: none;
    background-color: var(--color-surface-sunken);
    border-color: var(--color-accent);
    color: var(--color-text);
  }

  .resize-handle {
    position: absolute;
    right: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 12px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: col-resize;
    background: transparent;
    border: none;
    padding: 0;
    opacity: 0;
    transition: opacity var(--transition-fast);
  }

  .well-table-header:hover .resize-handle,
  .resize-handle:focus {
    opacity: 1;
  }

  .resize-grip {
    width: 3px;
    height: 14px;
    background: linear-gradient(
      to bottom,
      var(--color-border-strong) 0%,
      var(--color-border-strong) 20%,
      transparent 20%,
      transparent 40%,
      var(--color-border-strong) 40%,
      var(--color-border-strong) 60%,
      transparent 60%,
      transparent 80%,
      var(--color-border-strong) 80%,
      var(--color-border-strong) 100%
    );
    border-radius: 1px;
  }

  .resize-handle:hover .resize-grip,
  .resize-handle:focus .resize-grip {
    background: linear-gradient(
      to bottom,
      var(--color-accent) 0%,
      var(--color-accent) 20%,
      transparent 20%,
      transparent 40%,
      var(--color-accent) 40%,
      var(--color-accent) 60%,
      transparent 60%,
      transparent 80%,
      var(--color-accent) 80%,
      var(--color-accent) 100%
    );
  }

  /* Well list */
  .well-list {
    display: flex;
    flex-direction: column;
    max-height: 340px;
    overflow-y: auto;
    padding-right: var(--spacing-xs);
    margin-right: calc(-1 * var(--spacing-xs));
  }

  .well-row {
    display: flex;
    align-items: center;
    padding: var(--spacing-sm) 0;
    cursor: pointer;
    transition: background var(--transition-fast);
    border-bottom: 1px solid transparent;
  }

  .well-row:hover {
    background: var(--color-accent-soft);
  }

  .well-row.selected {
    background: var(--color-accent-soft);
  }

  .well-row:not(:last-child) {
    border-bottom-color: var(--color-border);
  }

  .cell-checkbox {
    width: 32px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .cell-primary,
  .cell-secondary {
    font-size: var(--font-size-sm);
    font-family: var(--font-mono);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    padding-right: var(--spacing-sm);
    min-width: 0;
  }

  .cell-primary {
    font-weight: 500;
    color: var(--color-text);
  }

  .cell-secondary {
    font-weight: 400;
    color: var(--color-text-secondary);
  }

  /* Checkbox styling for rows */
  .checkbox-wrapper {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    flex-shrink: 0;
  }

  .checkbox-wrapper input[type="checkbox"] {
    position: absolute;
    width: 18px;
    height: 18px;
    opacity: 0;
    cursor: pointer;
    margin: 0;
  }

  .checkbox-wrapper::before {
    content: "";
    width: 16px;
    height: 16px;
    border: 2px solid var(--color-border-strong);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    transition: all var(--transition-fast);
  }

  .well-row.selected .checkbox-wrapper::before {
    background: var(--color-accent);
    border-color: var(--color-accent);
  }

  .checkbox-wrapper .checkmark {
    position: absolute;
    width: 12px;
    height: 12px;
    color: white;
    opacity: 0;
    transform: scale(0.5);
    transition: all var(--transition-fast);
  }

  .well-row.selected .checkbox-wrapper .checkmark {
    opacity: 1;
    transform: scale(1);
  }
</style>
