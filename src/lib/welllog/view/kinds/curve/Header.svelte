<script lang="ts">
  /**
   * A curve track's header: one scale bar per curve, with its mnemonic,
   * unit, left and right values, and a sample of its line. While the depth
   * cursor is over the tracks, its value there replaces the unit. An entry
   * that matched nothing stays, struck through. The mnemonic, scale ends and
   * sample take the curve's colour as drawn: adapted on a dark track.
   *
   * A curve with cautions carries a ⚠ after its mnemonic (#34). A curve with
   * no value in the visible interval dims its scale bar and says "no data in
   * view" in place of its unit; the cursor's reading still replaces it.
   *
   * A click or tap anywhere on a scale bar, or on an unmatched entry's line,
   * opens that entry's curve editor (#55); its mnemonic is the button that
   * does so from the keyboard.
   */

  import { DASHES } from "../../canvas.ts";
  import CautionMark from "../../CautionMark.svelte";
  import { formatScaleEnd, hasValue } from "../../format.ts";
  import { getLogView } from "../../logView.svelte.ts";
  import { hasValueIn } from "../../quality.ts";
  import { entryLabel } from "../../template/label.ts";
  import type { ResolvedCurveTrack } from "./index.ts";

  let { resolved }: { resolved: ResolvedCurveTrack } = $props();

  const view = getLogView();
  const empty = $derived(resolved.entries.every((e) => !e.curve));
  const reading = $derived(view.readingOf(resolved.track.id));
  function edit(event: MouseEvent, entryId: string) {
    view.togglePopup({
      kind: "editor",
      trackId: resolved.track.id,
      entryId,
      anchor: event.currentTarget as HTMLElement,
    });
  }

  const inView = $derived(
    resolved.entries.map(({ curve }) => !curve || hasValueIn(view.log.md, curve.values, view.effectiveInterval)),
  );
</script>

<div class="curve-header">
  {#each resolved.entries as { entry, curve, scale }, i (entry.id)}
    {#if curve && scale}
      {@const cautions = view.cautions.get(curve.key)}
      <!-- The mnemonic is the keyboard's way in; the whole bar is the pointer's. -->
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <div
        class="scale-bar"
        class:no-data={!inView[i]}
        style:--curve={inView[i] ? view.strokeColour(entry.style.colour) : "var(--welllog-no-data)"}
        title={curve.description || curve.key}
        data-popup-anchor
        onclick={(event) => edit(event, entry.id)}
      >
        <div class="labels">
          <span class="end">{formatScaleEnd(scale.left)}</span>
          <span class="name">
            <button type="button" class="mnemonic" aria-label="Edit {curve.mnemonic}" aria-haspopup="dialog">
              {curve.mnemonic}
            </button>
            {#if cautions}
              <CautionMark {cautions} />
            {/if}
            {#if reading}
              <span class="value" class:none={!hasValue(reading[i])}>{reading[i]}</span>
            {:else if !inView[i]}
              <span class="no-data-note">no data in view</span>
            {:else if curve.unit}
              <span class="unit">{curve.unit}</span>
            {/if}
          </span>
          <span class="end">{formatScaleEnd(scale.right)}</span>
        </div>
        <svg class="sample" aria-hidden="true">
          <line
            x1="0"
            x2="100%"
            y1="50%"
            y2="50%"
            stroke-width={entry.style.width}
            stroke-dasharray={DASHES[entry.style.dash].map((d) => d * entry.style.width).join(" ") || undefined}
          />
        </svg>
      </div>
    {:else}
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <div class="unmatched" data-popup-anchor onclick={(event) => edit(event, entry.id)}>
        <button type="button" class="mnemonic" aria-haspopup="dialog"><s>{entryLabel(entry)}</s></button> — not in this
        well
      </div>
    {/if}
  {/each}
  {#if empty}
    <div class="empty">Nothing to draw in this well</div>
  {/if}
</div>

<style>
  .curve-header {
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    gap: 0.125rem;
    height: 100%;
    padding: 0.25rem 0.375rem;
    font-size: 0.6875rem;
    line-height: 1.2;
  }

  .scale-bar {
    color: var(--curve);
  }

  .scale-bar,
  .unmatched {
    cursor: pointer;
    border-radius: 2px;
  }

  .scale-bar:hover,
  .unmatched:hover {
    background: color-mix(in srgb, var(--welllog-text) 6%, transparent);
  }

  /* Dimmed, in --welllog-no-data, but not the ⚠ or the note saying why. */
  .no-data .end,
  .no-data .mnemonic,
  .no-data .sample {
    opacity: 0.5;
  }

  .no-data-note {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    font-style: italic;
    color: var(--welllog-no-data);
  }

  .labels {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.25rem;
    font-variant-numeric: tabular-nums;
  }

  .name {
    display: inline-flex;
    gap: 0.25rem;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
  }

  .mnemonic {
    padding: 0;
    font: inherit;
    font-weight: 600;
    color: inherit;
    background: none;
    border: 0;
    border-radius: 2px;
    cursor: pointer;
  }

  .unmatched .mnemonic {
    font-weight: inherit;
  }

  .mnemonic:focus-visible {
    outline: 2px solid var(--welllog-accent);
    outline-offset: 1px;
  }

  .unit,
  .value.none {
    color: var(--welllog-text-muted);
  }

  .value {
    color: var(--welllog-text);
  }

  .sample {
    display: block;
    width: 100%;
    height: 5px;
  }

  .sample line {
    stroke: var(--curve);
  }

  .unmatched,
  .empty {
    color: var(--welllog-text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .empty {
    font-style: italic;
  }
</style>
