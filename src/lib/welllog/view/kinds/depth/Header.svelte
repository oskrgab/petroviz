<script lang="ts">
  /**
   * A depth track's header: the depth reference it shows, and the depth
   * unit, or the depth at the cursor while it is over the tracks. A fixed
   * TVDSS track on a well log without TVDSS is greyed, and says so.
   */

  import { getLogView } from "../../logView.svelte.ts";
  import { depthTrackRef, type ResolvedDepthTrack } from "./index.ts";

  let { resolved }: { resolved: ResolvedDepthTrack } = $props();

  const view = getLogView();
  const ref = $derived(depthTrackRef(resolved.track, view.effectiveDepthRef));
  const reading = $derived(view.readingOf(resolved.track.id)?.[0]);
</script>

<div class="depth-header" class:missing={!resolved.shown}>
  <span class="ref">{ref === "md" ? "MD" : "TVDSS"}</span>
  {#if !resolved.shown}
    <span class="unit">not in this well log</span>
  {:else if reading}
    <span class="value">{reading}</span>
  {:else}
    <span class="unit">{view.log.depthUnit}</span>
  {/if}
</div>

<style>
  .depth-header {
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    align-items: center;
    height: 100%;
    padding: 0.25rem 0.25rem 0.375rem;
    font-size: 0.6875rem;
    line-height: 1.2;
  }

  .ref {
    font-weight: 600;
  }

  .missing {
    color: var(--welllog-text-muted);
    text-align: center;
  }

  .unit {
    color: var(--welllog-text-muted);
  }

  .value {
    font-variant-numeric: tabular-nums;
  }
</style>
