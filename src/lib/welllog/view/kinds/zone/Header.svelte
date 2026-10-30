<script lang="ts">
  /**
   * A zone track's header: the zone set's name, or, when the well log has no
   * zone set of that name, the name struck through.
   *
   * Below the name, the zone name at the depth cursor while it is over the
   * tracks; the line is kept empty otherwise, so the header row never jumps.
   */

  import { hasValue } from "../../format.ts";
  import { getLogView } from "../../logView.svelte.ts";
  import type { ResolvedZoneTrack } from "./index.ts";

  let { resolved }: { resolved: ResolvedZoneTrack } = $props();

  const view = getLogView();
  const reading = $derived(view.readingOf(resolved.track.id)?.[0]);
</script>

<div class="zone-header" title={resolved.track.zoneSet}>
  {#if resolved.zoneSet}
    <span class="name">{resolved.track.zoneSet}</span>
    <span class="reading" class:none={!hasValue(reading)} title={reading}>{reading ?? "\u00a0"}</span>
  {:else}
    <span class="name unmatched"><s>{resolved.track.zoneSet}</s></span>
    <span class="missing">not in this well</span>
  {/if}
</div>

<style>
  .zone-header {
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
