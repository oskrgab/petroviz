<script lang="ts">
  /**
   * A discrete track's header: the curve's family label (its mnemonic when
   * the family has none), or, when nothing matched, the entry struck through.
   */

  import { entryLabel, familyLabel } from "../../template/label.ts";
  import type { ResolvedDiscreteTrack } from "./index.ts";

  let { resolved }: { resolved: ResolvedDiscreteTrack } = $props();

  const matched = $derived(resolved.entries[0]);
  const name = $derived(
    matched.curve
      ? matched.curve.family === "unknown"
        ? matched.curve.mnemonic
        : familyLabel(matched.curve.family)
      : entryLabel(matched.entry),
  );
</script>

<div class="discrete-header" title={matched.curve ? matched.curve.description || matched.curve.mnemonic : undefined}>
  {#if matched.curve}
    <span class="name">{name}</span>
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
  .missing {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .name {
    font-weight: 600;
  }

  .unmatched,
  .missing {
    color: var(--welllog-text-muted);
  }

  .unmatched {
    font-weight: 400;
  }
</style>
