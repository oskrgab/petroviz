<script lang="ts">
  /**
   * CumulativePieChart Component
   *
   * Donut chart showing cumulative oil vs water production proportions.
   * Uses Unovis Svelte components.
   */

  import { VisSingleContainer, VisDonut } from "@unovis/svelte";
  import { formatVolume, formatPercent } from "$lib/utils/formatters";

  interface Props {
    oilTotal: number;
    waterTotal: number;
    height?: number;
  }

  let { oilTotal, waterTotal, height = 300 }: Props = $props();

  // Color constants
  const OIL_COLOR = "#16a34a";
  const WATER_COLOR = "#0ea5e9";

  // Sanitize input values
  const safeOil = $derived(
    Number.isFinite(oilTotal) && oilTotal >= 0 ? oilTotal : 0,
  );
  const safeWater = $derived(
    Number.isFinite(waterTotal) && waterTotal >= 0 ? waterTotal : 0,
  );

  interface PieDataRecord {
    label: string;
    value: number;
    color: string;
  }

  const data = $derived<PieDataRecord[]>([
    { label: "Oil", value: safeOil, color: OIL_COLOR },
    { label: "Water", value: safeWater, color: WATER_COLOR },
  ]);

  const total = $derived(safeOil + safeWater);

  const oilPercent = $derived(
    total > 0 ? formatPercent(safeOil / total, true) : "0%",
  );
  const waterPercent = $derived(
    total > 0 ? formatPercent(safeWater / total, true) : "0%",
  );

  const value = (d: PieDataRecord) => d.value;
  const color = (d: PieDataRecord) => d.color;

  const centralLabel = $derived(formatVolume(total));
  const centralSubLabel = "Total";

  const hasData = $derived(total > 0);
</script>

<div class="chart-container">
  <div class="chart-header">
    <div class="header-left">
      <h3>Field Cumulative</h3>
      <span class="subtitle">Oil & Water Production</span>
    </div>
  </div>

  {#if hasData}
    <div class="chart-wrapper">
      <VisSingleContainer {data} {height}>
        <VisDonut
          {value}
          {color}
          arcWidth={50}
          {centralLabel}
          {centralSubLabel}
          showEmptySegments={false}
          cornerRadius={4}
        />
      </VisSingleContainer>
    </div>

    <div class="legend">
      <div class="legend-item">
        <div class="legend-icon oil">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M12 2C12 2 5 10 5 15C5 18.866 8.134 22 12 22C15.866 22 19 18.866 19 15C19 10 12 2 12 2Z"
            />
          </svg>
        </div>
        <div class="legend-content">
          <span class="legend-label">Oil</span>
          <span class="legend-volume">{formatVolume(safeOil)}</span>
        </div>
        <span class="legend-percent">{oilPercent}</span>
      </div>
      <div class="legend-item">
        <div class="legend-icon water">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M12 2C12 2 5 10 5 15C5 18.866 8.134 22 12 22C15.866 22 19 18.866 19 15C19 10 12 2 12 2Z"
            />
          </svg>
        </div>
        <div class="legend-content">
          <span class="legend-label">Water</span>
          <span class="legend-volume">{formatVolume(safeWater)}</span>
        </div>
        <span class="legend-percent">{waterPercent}</span>
      </div>
    </div>
  {:else}
    <div class="no-data">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 3v9l6 3" />
      </svg>
      <p>No production data available</p>
    </div>
  {/if}
</div>

<style>
  .chart-container {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .chart-header {
    margin-bottom: var(--spacing-sm);
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

  .chart-wrapper {
    flex: 1;
    min-height: 200px;
    overflow: hidden;
  }

  /* Override Unovis central label styles */
  :global(.unovis-donut-central-label) {
    font-family: var(--font-mono) !important;
    font-weight: 600 !important;
    font-size: var(--font-size-lg) !important;
    fill: var(--color-text) !important;
  }

  :global(.unovis-donut-central-sub-label) {
    font-family: var(--font-sans) !important;
    font-size: var(--font-size-xs) !important;
    fill: var(--color-text-muted) !important;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .legend {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
    padding: var(--spacing-md);
    background: var(--color-surface-sunken);
    border-radius: var(--radius-md);
    margin-top: var(--spacing-md);
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
  }

  .legend-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: var(--radius-md);
    flex-shrink: 0;
  }

  .legend-icon svg {
    width: 16px;
    height: 16px;
  }

  .legend-icon.oil {
    background: var(--color-oil-soft);
    color: var(--color-oil);
  }

  .legend-icon.water {
    background: var(--color-water-soft);
    color: var(--color-water);
  }

  .legend-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .legend-label {
    font-size: var(--font-size-sm);
    font-weight: 500;
    color: var(--color-text);
  }

  .legend-volume {
    font-size: var(--font-size-xs);
    font-family: var(--font-mono);
    color: var(--color-text-muted);
  }

  .legend-percent {
    font-size: var(--font-size-base);
    font-weight: 600;
    font-family: var(--font-mono);
    color: var(--color-text);
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

  :global(.unovis-single-container) {
    width: 100%;
    max-width: 100%;
  }

  :global(.unovis-single-container svg) {
    max-width: 100%;
  }
</style>
