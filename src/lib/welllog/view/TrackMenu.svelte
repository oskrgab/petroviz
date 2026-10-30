<script lang="ts">
  /**
   * A track's ⋯ menu (#56): how a track is moved on touch, where there is no
   * header to drag, and its other actions anywhere: a curve track's fills,
   * resetting its width, and removing it. A move closes the menu, since its
   * anchor moves with the track.
   */

  import { getLogView } from "./logView.svelte.ts";
  import { trackSummary } from "./tracks.ts";

  interface Props {
    trackId: string;
    anchor: HTMLElement;
    onclose: () => void;
  }

  let { trackId, anchor, onclose }: Props = $props();

  const view = getLogView();
  const index = $derived(view.resolved.tracks.findIndex((t) => t.track.id === trackId));
  const resolved = $derived(view.resolved.tracks[index]);
  const summary = $derived(resolved && trackSummary(resolved));
  const last = $derived(view.resolved.tracks.length - 1);

  function move(to: number) {
    view.edit({ kind: "move-track", trackId, to });
    onclose();
  }
</script>

{#if resolved && summary}
  <div class="menu">
    <div class="head">
      <span class="title"><b>{summary.kind}</b> {summary.detail}</span>
      <button type="button" class="close" aria-label="Close the track menu" onclick={onclose}>×</button>
    </div>
    <button type="button" disabled={index === 0} onclick={() => move(index - 1)}>← Move left</button>
    <button type="button" disabled={index === last} onclick={() => move(index + 1)}>Move right →</button>
    {#if resolved.kind === "curve"}
      <button type="button" onclick={() => (view.popup = { kind: "fills", trackId, anchor })}>Fills…</button>
    {/if}
    <button type="button" onclick={() => view.edit({ kind: "reset-track-width", trackId })}>Reset width</button>
    <button type="button" class="remove" onclick={() => view.edit({ kind: "remove-track", trackId })}>
      Remove track
    </button>
  </div>
{/if}

<style>
  .menu {
    display: flex;
    flex-direction: column;
    padding: 0.375rem 0;
  }

  .head {
    display: flex;
    align-items: baseline;
    gap: 0.375rem;
    padding: 0 0.625rem 0.375rem;
    margin-bottom: 0.25rem;
    border-bottom: 1px solid var(--welllog-border);
  }

  .title {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    color: var(--welllog-text-muted);
  }

  .title b {
    color: var(--welllog-text);
  }

  button {
    padding: 0.3125rem 0.625rem;
    font: inherit;
    text-align: left;
    color: var(--welllog-text);
    background: none;
    border: 0;
    cursor: pointer;
  }

  button:hover:not(:disabled),
  button:focus-visible {
    background: color-mix(in srgb, var(--welllog-accent) 12%, transparent);
  }

  button:focus-visible {
    outline: 2px solid var(--welllog-accent);
    outline-offset: -2px;
  }

  button:disabled {
    color: var(--welllog-text-muted);
    cursor: default;
  }

  .remove:hover {
    color: var(--welllog-cursor);
  }

  .head .close {
    margin-left: auto;
    padding: 0 0.25rem;
    font-size: 1rem;
    line-height: 1;
    color: var(--welllog-text-muted);
  }
</style>
