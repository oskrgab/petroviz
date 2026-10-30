<script lang="ts">
  /**
   * A discrete track's header: the curve's family label (its mnemonic when
   * the family has none), or, when nothing matched, the entry struck through.
   *
   * Below the name, the code's label (or the raw code) at the depth cursor
   * while it is over the tracks; the line is kept empty otherwise, so the
   * header row never jumps.
   */

  import { hasValue } from "../../format.ts";
  import { getLogView } from "../../logView.svelte.ts";
  import { entryLabel } from "../../template/label.ts";
  import { discreteCurveName, type ResolvedDiscreteTrack } from "./index.ts";

  let { resolved }: { resolved: ResolvedDiscreteTrack } = $props();

  const view = getLogView();
  const reading = $derived(view.readingOf(resolved.track.id)?.[0]);

  const matched = $derived(resolved.entries[0]);
  const name = $derived(matched.curve ? discreteCurveName(matched.curve) : entryLabel(matched.entry));
</script>

<div class="discrete-header" title={matched.curve ? matched.curve.description || matched.curve.mnemonic : undefined}>
  {#if matched.curve}
    <span class="name">{name}</span>
    <span class="reading" class:none={!hasValue(reading)}>{reading ?? "\u00a0"}</span>
  {:else}
    <span class="name unmatched"><s>{name}</s></span>
    <span class="missing">not in this well</span>
  {/if}
</div>

<style>
  .discrete-header {
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    height: 100%;
    padding: 0.25rem 0.375rem 0.375rem;
    font-size: 0.6875rem;
    line-height: 1.2;
    min-width: 0;
  }

  .name,
  .missing,
  .reading {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .name {
    font-weight: 600;
  }

  .unmatched,
  .missing,
  .reading.none {
    color: var(--welllog-text-muted);
  }

  .unmatched {
    font-weight: 400;
  }
</style>
