<script lang="ts">
  /**
   * A depth track's header: the depth reference it shows, and the depth unit.
   */

  import { getLogView } from "../../logView.svelte.ts";
  import { depthTrackRef, type ResolvedDepthTrack } from "./index.ts";

  let { resolved }: { resolved: ResolvedDepthTrack } = $props();

  const view = getLogView();
  const ref = $derived(depthTrackRef(resolved.track, view.effectiveDepthRef));
</script>

<div class="depth-header">
  <span class="ref">{ref === "md" ? "MD" : "TVDSS"}</span>
  <span class="unit">{view.log.depthUnit}</span>
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

  .unit {
    color: var(--welllog-text-muted);
  }
</style>
