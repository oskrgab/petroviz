<script lang="ts">
  /**
   * The add-curve picker (#28, #55): what a curve track's ＋ opens. It lists
   * the curves the current template doesn't display, under a visible count,
   * each with a ⚠ when it has cautions, and its range and the % missing
   * inside it. The curves already shown follow, folded away, since the same
   * curve may be added again on another scale.
   *
   * Picking one adds an entry for it to the track, with `[key, mnemonic,
   * family]` selectors and its curve family's defaults (entryForCurve).
   */

  import type { Curve } from "../core/index.ts";
  import CautionMark from "./CautionMark.svelte";
  import { formatCoverage } from "./format.ts";
  import { getLogView } from "./logView.svelte.ts";
  import { notShownLabel, pickerCurves } from "./picker.ts";
  import { curveCoverage } from "./quality.ts";
  import { entryForCurve } from "./template/edit.ts";
  import { familyLabel } from "./template/label.ts";

  interface Props {
    trackId: string;
    onclose: () => void;
  }

  let { trackId, onclose }: Props = $props();

  const view = getLogView();
  const curves = $derived(pickerCurves(view.resolved, view.log.curves));

  function pick(curve: Curve) {
    view.edit({ kind: "add-entry", trackId, entry: entryForCurve(view.template, curve) });
    onclose();
  }

  function details(curve: Curve): string {
    const coverage = curveCoverage(view.log.md, curve.values);
    const family = familyLabel(curve.family);
    // A family's short label is often its usual mnemonic; it adds nothing there.
    const named = family.toUpperCase() !== curve.mnemonic.toUpperCase() && family;
    return [curve.unit, named, coverage && formatCoverage(coverage, view.log.depthUnit)]
      .filter(Boolean)
      .join(" · ");
  }
</script>

{#snippet row(curve: Curve)}
  {@const cautions = view.cautions.get(curve.key)}
  <li>
    <button type="button" class="pick" onclick={() => pick(curve)}>
      <span class="key">{curve.key}</span>
      <span class="details">{details(curve)}</span>
    </button>
    {#if cautions}
      <span class="mark"><CautionMark {cautions} /></span>
    {/if}
  </li>
{/snippet}

<div class="picker">
  <div class="head">
    <span class="count">{notShownLabel(curves.notShown.length)}</span>
    <button type="button" class="close" aria-label="Close the curve picker" onclick={onclose}>×</button>
  </div>
  {#if curves.notShown.length > 0}
    <ul aria-label="Curves not shown">
      {#each curves.notShown as curve (curve.key)}
        {@render row(curve)}
      {/each}
    </ul>
  {/if}
  {#if curves.shown.length > 0}
    <details open={curves.notShown.length === 0}>
      <summary>Shown curves, to add on another scale ({curves.shown.length})</summary>
      <ul aria-label="Shown curves">
        {#each curves.shown as curve (curve.key)}
          {@render row(curve)}
        {/each}
      </ul>
    </details>
  {/if}
</div>

<style>
  .picker {
    display: flex;
    flex-direction: column;
    padding: 0.375rem 0 0.375rem;
  }

  .head {
    display: flex;
    align-items: baseline;
    padding: 0 0.625rem 0.375rem;
    border-bottom: 1px solid var(--welllog-border);
  }

  .count {
    font-weight: 600;
  }

  .close {
    margin-left: auto;
    padding: 0 0.25rem;
    font-size: 1rem;
    line-height: 1;
    color: var(--welllog-text-muted);
    background: none;
    border: 0;
    cursor: pointer;
  }

  ul {
    margin: 0;
    padding: 0.25rem 0;
    list-style: none;
  }

  li {
    display: flex;
    align-items: flex-start;
  }

  .pick {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
    padding: 0.25rem 0.625rem;
    font: inherit;
    text-align: left;
    color: var(--welllog-text);
    background: none;
    border: 0;
    cursor: pointer;
  }

  .pick:hover,
  .pick:focus-visible {
    background: color-mix(in srgb, var(--welllog-accent) 12%, transparent);
  }

  .pick:focus-visible {
    outline: 2px solid var(--welllog-accent);
    outline-offset: -2px;
  }

  .key {
    font-weight: 600;
  }

  .details {
    font-size: 0.6875rem;
    font-variant-numeric: tabular-nums;
    color: var(--welllog-text-muted);
  }

  .mark {
    padding: 0.25rem 0.625rem 0 0;
  }

  details {
    border-top: 1px solid var(--welllog-border);
  }

  summary {
    padding: 0.375rem 0.625rem 0.125rem;
    color: var(--welllog-text-muted);
    cursor: pointer;
  }
</style>
