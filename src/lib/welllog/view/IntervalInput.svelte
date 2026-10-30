<script lang="ts">
  /**
   * The top bar's navigation: the exact interval (MD for now; TVDSS input is
   * #48) and the zoom buttons. The fields follow the view until one is
   * typed in, and a typed entry applies on Enter or when focus leaves the
   * pair. An entry that isn't two numbers with top above base, or lies wholly
   * outside the well, is dropped and the fields show the view again; merely
   * passing through the fields writes nothing.
   */

  import { getLogView } from "./logView.svelte.ts";
  import { spanInUnit, typedInterval, zoomToSpan } from "./navigation.ts";

  /** The zoom buttons' spans, written in metres. */
  const ZOOM_METRES = [500, 100, 20] as const;

  const view = getLogView();

  // Set by typing, and cleared once the entry is applied or dropped.
  let typed = $state(false);
  let top = $state("");
  let base = $state("");

  $effect(() => {
    const shown = view.effectiveInterval;
    if (typed) return;
    top = shown.top.toFixed(1);
    base = shown.base.toFixed(1);
  });

  function apply() {
    if (!typed) return;
    const entered = typedInterval(top, base, view.whole);
    if (entered) view.navigate(entered);
    typed = false;
  }

  function onfocusout(event: FocusEvent) {
    const next = event.relatedTarget;
    if (next instanceof Node && (event.currentTarget as HTMLElement).contains(next)) return;
    apply();
  }

  function onkeydown(event: KeyboardEvent) {
    if (event.key === "Enter") apply();
    else if (event.key === "Escape") typed = false;
  }
</script>

<div class="navigation">
  <fieldset class="interval" {onfocusout}>
    <legend class="visually-hidden">Visible interval</legend>
    <span class="ref">MD</span>
    <input bind:value={top} oninput={() => (typed = true)} {onkeydown} inputmode="decimal" aria-label="Top MD" />
    <span aria-hidden="true">–</span>
    <input bind:value={base} oninput={() => (typed = true)} {onkeydown} inputmode="decimal" aria-label="Base MD" />
    <span class="unit">{view.log.depthUnit}</span>
  </fieldset>

  <div class="zoom" role="group" aria-label="Zoom">
    <button type="button" onclick={() => view.navigate(view.whole)}>Whole well</button>
    {#each ZOOM_METRES as metres (metres)}
      <button
        type="button"
        onclick={() => view.navigate(zoomToSpan(view.effectiveInterval, spanInUnit(metres, view.log.depthUnit), view.whole))}
      >
        {metres} m
      </button>
    {/each}
  </div>
</div>

<style>
  .navigation {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8125rem;
  }

  .interval {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    margin: 0;
    padding: 0;
    border: 0;
    color: var(--welllog-text-muted);
  }

  .ref {
    font-weight: 600;
    color: var(--welllog-text);
  }

  input {
    width: 8.5ch;
    padding: 0.1875rem 0.375rem;
    font: inherit;
    font-variant-numeric: tabular-nums;
    text-align: right;
    color: var(--welllog-text);
    background: var(--welllog-bg);
    border: 1px solid var(--welllog-border);
    border-radius: 4px;
  }

  input:focus-visible,
  button:focus-visible {
    outline: 2px solid var(--welllog-accent);
    outline-offset: 1px;
  }

  .zoom {
    display: inline-flex;
  }

  button {
    padding: 0.25rem 0.5rem;
    font: inherit;
    font-variant-numeric: tabular-nums;
    color: var(--welllog-text);
    background: transparent;
    border: 1px solid var(--welllog-border);
    cursor: pointer;
  }

  button + button {
    margin-left: -1px;
  }

  button:first-child {
    border-radius: 4px 0 0 4px;
  }

  button:last-child {
    border-radius: 0 4px 4px 0;
  }

  button:hover {
    position: relative;
    border-color: var(--welllog-accent);
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
