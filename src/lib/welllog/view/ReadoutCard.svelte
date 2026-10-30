<script lang="ts">
  /**
   * The depth cursor's floating card, beside the pointer: the rows of
   * cardGroups (readout.ts), a group at a time. It flips side near the
   * window's edges (placement.ts). Opt-in: LogView mounts it only while the
   * reader has it on, and it shows only while the depth cursor is over the
   * tracks.
   *
   * It follows the pointer, so it takes no pointer events and is hidden from
   * assistive technology; the headers carry the same readout.
   */

  import { hasValue } from "./format.ts";
  import { getLogView } from "./logView.svelte.ts";
  import { cardPlacement } from "./placement.ts";
  import { cardGroups } from "./readout.ts";

  const view = getLogView();
  let width = $state(0);
  let height = $state(0);
  let innerWidth = $state(0);
  let innerHeight = $state(0);

  const groups = $derived(view.readout ? cardGroups(view.log, view.resolved.tracks, view.readout) : []);

  const place = $derived(
    view.pointer
      ? cardPlacement(
          { x: view.pointer.clientX, y: view.pointer.clientY },
          { width, height },
          { width: innerWidth, height: innerHeight },
        )
      : null,
  );
</script>

<svelte:window bind:innerWidth bind:innerHeight />

{#if groups.length > 0 && place}
  <div
    class="readout-card"
    aria-hidden="true"
    bind:offsetWidth={width}
    bind:offsetHeight={height}
    style:left="{place.left}px"
    style:top="{place.top}px"
    style:visibility={width > 0 ? "visible" : "hidden"}
  >
    {#each groups as rows}
      <dl>
        {#each rows as { label, value, unit, colour }}
          <dt style:color={colour}>{label}</dt>
          <dd class:none={!hasValue(value)}>
            {value}{#if unit && hasValue(value)}<span class="unit">{unit}</span>{/if}
          </dd>
        {/each}
      </dl>
    {/each}
  </div>
{/if}

<style>
  .readout-card {
    position: fixed;
    z-index: 20;
    min-width: 10rem;
    max-width: 18rem;
    padding: 0.25rem 0.5rem;
    pointer-events: none;
    font-size: 0.6875rem;
    line-height: 1.35;
    color: var(--welllog-text);
    background: var(--welllog-header-bg);
    border: 1px solid var(--welllog-border);
    border-radius: 4px;
    box-shadow: 0 4px 12px rgb(15 23 42 / 0.18);
  }

  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    column-gap: 0.75rem;
    margin: 0;
    padding: 0.25rem 0;
  }

  dl + dl {
    border-top: 1px solid var(--welllog-border);
  }

  dt {
    font-weight: 600;
    white-space: nowrap;
  }

  dd {
    margin: 0;
    text-align: right;
    font-variant-numeric: tabular-nums;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  dd.none,
  .unit {
    color: var(--welllog-text-muted);
  }

  .unit {
    margin-left: 0.25rem;
  }
</style>
