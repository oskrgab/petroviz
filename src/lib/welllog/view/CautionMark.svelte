<script lang="ts">
  /**
   * The ⚠ a curve's cautions add after its mnemonic, in --welllog-caution.
   * Its messages show beside it on hover and on keyboard focus. They sit in
   * the top layer (a manual popover), so the header's overflow can't cut
   * them off and a dimmed scale bar doesn't dim them; the ⚠ carries an
   * empty title so the scale bar's own tooltip doesn't show over them.
   */

  import type { LoadWarning } from "../core/index.ts";
  import { cardPlacement } from "./placement.ts";

  let { cautions }: { cautions: readonly LoadWarning[] } = $props();

  const id = $props.id();
  let mark: HTMLElement;
  let tip: HTMLElement;
  let place = $state.raw({ left: 0, top: 0 });

  function show() {
    if (tip.matches(":popover-open")) return;
    tip.showPopover();
    const r = mark.getBoundingClientRect();
    place = cardPlacement(
      { x: r.left + r.width / 2, y: r.top + r.height / 2 },
      { width: tip.offsetWidth, height: tip.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight },
    );
  }

  function hide() {
    if (tip.matches(":popover-open")) tip.hidePopover();
  }

  function onkeydown(event: KeyboardEvent) {
    if (event.key === "Escape") hide();
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<span
  class="caution"
  role="img"
  aria-label={cautions.length === 1 ? "Caution" : `${cautions.length} cautions`}
  aria-describedby={id}
  title=""
  tabindex="0"
  bind:this={mark}
  onpointerenter={show}
  onpointerleave={hide}
  onfocus={show}
  onblur={hide}
  {onkeydown}>⚠</span
>
<div class="caution-tip" popover="manual" role="tooltip" {id} bind:this={tip} style:left="{place.left}px" style:top="{place.top}px">
  {#each cautions as caution, i (i)}
    <p>{caution.message}</p>
  {/each}
</div>

<style>
  .caution {
    color: var(--welllog-caution);
    font-weight: 400;
    cursor: help;
    border-radius: 2px;
  }

  .caution:focus-visible {
    outline: 2px solid var(--welllog-accent);
    outline-offset: 1px;
  }

  .caution-tip {
    position: fixed;
    inset: auto;
    margin: 0;
    max-width: 18rem;
    padding: 0.25rem 0.5rem;
    font-size: 0.6875rem;
    line-height: 1.35;
    white-space: normal;
    color: var(--welllog-text);
    background: var(--welllog-header-bg);
    border: 1px solid var(--welllog-caution);
    border-radius: 4px;
    box-shadow: 0 4px 12px rgb(15 23 42 / 0.18);
    pointer-events: none;
  }

  p {
    margin: 0;
  }

  p + p {
    margin-top: 0.25rem;
  }
</style>
