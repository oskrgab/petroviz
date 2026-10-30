<script lang="ts">
  /**
   * What the ＋ after the tracks opens (#30, #56): a new
   * track of any kind, added at the end. A curve track starts empty, for its
   * own ＋ to fill. A depth track shows the active depth reference or a fixed
   * one; a fixed TVDSS one can be added to a well log without TVDSS, where it
   * shows greyed. A discrete track takes one of the well log's discrete
   * curves, or looks for lithology when there are none; a zone track takes
   * one of its zone sets.
   */

  import { getLogView } from "./logView.svelte.ts";
  import { newCurveTrack, newDepthTrack, newDiscreteTrack, newZoneTrack } from "./template/edit.ts";
  import type { DepthTrackRef, Track } from "./template/types.ts";

  let { onclose }: { onclose: () => void } = $props();

  const view = getLogView();
  const discrete = $derived(view.log.curves.filter((c) => c.kind === "discrete"));
  
  const DEPTHS: readonly [DepthTrackRef, string][] = [
    ["active", "Active depth reference"],
    ["md", "MD"],
    ["tvdss", "TVDSS"],
  ];

  function add(build: () => Track) {
    view.edit({ kind: "add-track", track: build() });
    onclose();
  }
</script>

<div class="menu">
  <div class="head">
    <span class="title">Add a track</span>
    <button type="button" class="close" aria-label="Close" onclick={onclose}>×</button>
  </div>

  <button type="button" onclick={() => add(() => newCurveTrack(view.template))}>Curve track</button>

  <h3>Depth track</h3>
  {#each DEPTHS as [ref, name] (ref)}
    <button type="button" onclick={() => add(() => newDepthTrack(view.template, ref))}>
      {name}
      {#if ref === "tvdss" && !view.hasTvdss}<span class="note">not in this well log</span>{/if}
    </button>
  {/each}

  <h3>Discrete track</h3>
  {#each discrete as curve (curve.key)}
    <button type="button" onclick={() => add(() => newDiscreteTrack(view.template, curve))}>
      {curve.key}
    </button>
  {:else}
    <button type="button" onclick={() => add(() => newDiscreteTrack(view.template, null))}>
      Lithology <span class="note">none in this well log</span>
    </button>
  {/each}

  <h3>Zone track</h3>
  {#each view.log.zoneSets as zoneSet (zoneSet.name)}
    <button type="button" onclick={() => add(() => newZoneTrack(view.template, zoneSet.name))}>{zoneSet.name}</button>
  {:else}
    <p class="note">This well log has no zone sets.</p>
  {/each}
</div>

<style>
  .menu {
    display: flex;
    flex-direction: column;
    padding: 0.375rem 0;
  }

  .head {
    display: flex;
    align-items: baseline;
    padding: 0 0.625rem 0.375rem;
    border-bottom: 1px solid var(--welllog-border);
  }

  .title {
    font-weight: 600;
  }

  h3 {
    margin: 0.5rem 0 0.125rem;
    padding: 0 0.625rem;
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--welllog-text-muted);
  }

  button {
    display: flex;
    align-items: baseline;
    gap: 0.375rem;
    padding: 0.3125rem 0.625rem;
    font: inherit;
    text-align: left;
    color: var(--welllog-text);
    background: none;
    border: 0;
    cursor: pointer;
  }

  button:hover,
  button:focus-visible {
    background: color-mix(in srgb, var(--welllog-accent) 12%, transparent);
  }

  button:focus-visible {
    outline: 2px solid var(--welllog-accent);
    outline-offset: -2px;
  }

  .note {
    font-size: 0.6875rem;
    color: var(--welllog-text-muted);
  }

  p.note {
    margin: 0;
    padding: 0.125rem 0.625rem;
  }

  .head .close {
    margin-left: auto;
    padding: 0 0.25rem;
    font-size: 1rem;
    line-height: 1;
    color: var(--welllog-text-muted);
  }
</style>
