<script lang="ts">
  /**
   * A curve track's fills (#28, #56): each between two boundaries (a curve
   * in the track, a value on the other side's curve scale, or a track
   * edge) with its two colours, where the first boundary lies left of the
   * second and where it lies right. Fills are added, edited and removed
   * through view.edit, so each change draws at once.
   *
   * A boundary that would leave the fill unable to draw (a value with no
   * curve on the other side, two edges) is offered disabled. A colour can
   * be none, for a fill that shades one side only, as the GR fills do; a
   * colour picked keeps its alpha. Beside a colour, a "drawn on dark as"
   * swatch shows when it is drawn otherwise on a dark track (ADR-0006).
   *
   * A value is on the other side's curve scale, so when that side changes
   * curve, the value starts again half-way across the new one.
   */

  import { boundaryChoice, boundaryOf, colourWithNone, colourWithRgb, isNoColour } from "./fills.ts";
  import { getLogView } from "./logView.svelte.ts";
  import { boundaryLabel } from "./tracks.ts";
  import { fillCanDraw, newFill } from "./template/edit.ts";
  import type { CurveTrack, Fill, FillBoundary } from "./template/types.ts";

  interface Props {
    trackId: string;
    onclose?: () => void;
  }

  let { trackId, onclose }: Props = $props();

  const view = getLogView();
  const resolved = $derived.by(() => {
    const track = view.resolved.tracks.find((t) => t.track.id === trackId);
    return track?.kind === "curve" ? track : null;
  });

  /** The choices for either boundary, as `<option>` values. */
  const choices = $derived<[string, string][]>([
    ...(resolved?.entries ?? []).map(({ entry }): [string, string] => [
      boundaryChoice({ kind: "curve", id: entry.id }),
      boundaryLabel({ kind: "curve", id: entry.id }, resolved!.entries),
    ]),
    ["value", "A value"],
    ["edge:left", "Left edge"],
    ["edge:right", "Right edge"],
  ]);

  /** A curve boundary's scale as drawn in this well log; null for other boundaries and unmatched entries. */
  const scaleOf = (boundary: FillBoundary) =>
    (boundary.kind === "curve" && resolved?.entries.find((e) => e.entry.id === boundary.id)?.scale) || null;

  const otherSide = (side: "a" | "b") => (side === "a" ? "b" : "a");

  function canChoose(track: CurveTrack, fill: Fill, side: "a" | "b", choice: string): boolean {
    const other = fill[otherSide(side)];
    const boundary = boundaryOf(choice, scaleOf(other));
    return fillCanDraw(track, side === "a" ? { a: boundary, b: other } : { a: other, b: boundary });
  }

  function choose(fill: Fill, side: "a" | "b", choice: string) {
    const other = otherSide(side);
    const boundary = boundaryOf(choice, scaleOf(fill[other]));
    // A value on the other side was placed on the curve this side had.
    const replaced = fill[other].kind === "value" && boundary.kind === "curve" && { [other]: boundaryOf("value", scaleOf(boundary)) };
    view.edit({ kind: "set-fill", trackId, fillId: fill.id, change: { [side]: boundary, ...replaced } });
  }

  function setValue(fill: Fill, side: "a" | "b", text: string) {
    const value = Number(text);
    if (text.trim() === "" || !Number.isFinite(value)) return;
    view.edit({ kind: "set-fill", trackId, fillId: fill.id, change: { [side]: { kind: "value", value } } });
  }

  const COLOURS = ["colourWhereALeft", "colourWhereARight"] as const;

  function setColour(fill: Fill, key: (typeof COLOURS)[number], colour: string) {
    view.edit({ kind: "set-fill", trackId, fillId: fill.id, change: { [key]: colour } });
  }

  function add(track: CurveTrack) {
    const first = track.curves[0];
    if (!first) return;
    view.edit({
      kind: "add-fill",
      trackId,
      fill: newFill(view.template, { kind: "curve", id: first.id }, { kind: "edge", edge: "right" }),
    });
  }
</script>

{#if resolved}
  {@const track = resolved.track}
  {@const entries = resolved.entries}
  <div class="fills">
    {#if onclose}
      <div class="head">
        <span class="title">Fills</span>
        <button type="button" class="close" aria-label="Close the fills" onclick={onclose}>×</button>
      </div>
    {/if}
    {#each track.fills ?? [] as fill (fill.id)}
      {@const [aName, bName] = [boundaryLabel(fill.a, entries), boundaryLabel(fill.b, entries)]}
      <fieldset>
        <legend class="visually-hidden">Fill {aName} to {bName}</legend>
        <div class="sides">
          {#each ["a", "b"] as const as side, i (side)}
            {@const boundary = fill[side]}
            {#if i === 1}<span class="muted">to</span>{/if}
            <select
              aria-label={side === "a" ? "From" : "To"}
              value={boundaryChoice(boundary)}
              onchange={(event) => choose(fill, side, event.currentTarget.value)}
            >
              {#each choices as [value, name] (value)}
                <option {value} disabled={value !== boundaryChoice(boundary) && !canChoose(track, fill, side, value)}>{name}</option>
              {/each}
            </select>
            {#if boundary.kind === "value"}
              <input
                type="number"
                step="any"
                aria-label={side === "a" ? "From value" : "To value"}
                value={boundary.value}
                onchange={(event) => setValue(fill, side, event.currentTarget.value)}
              />
            {/if}
          {/each}
          <button
            type="button"
            class="remove"
            aria-label="Remove the fill {aName} to {bName}"
            title="Remove this fill"
            onclick={() => view.edit({ kind: "remove-fill", trackId, fillId: fill.id })}>×</button
          >
        </div>
        {#each COLOURS as key (key)}
          {@const colour = fill[key]}
          {@const none = isNoColour(colour)}
          {@const drawn = view.fillColour(colour)}
          <div class="colour">
            <span class="where">Where {aName} is {key === "colourWhereALeft" ? "left" : "right"} of {bName}</span>
            <input
              type="color"
              aria-label="Colour where {aName} is {key === 'colourWhereALeft' ? 'left' : 'right'} of {bName}"
              value={colour.slice(0, 7).toLowerCase()}
              disabled={none}
              oninput={(event) => setColour(fill, key, colourWithRgb(colour, event.currentTarget.value))}
            />
            <label>
              <input
                type="checkbox"
                checked={none}
                onchange={(event) => setColour(fill, key, colourWithNone(colour, event.currentTarget.checked))}
              />
              None
            </label>
            {#if !none && drawn.toUpperCase() !== colour.toUpperCase()}
              <span class="drawn" title="Template colours are written for a light track and adapted on a dark one">
                drawn on dark as <span class="swatch" style:background={drawn}></span>
              </span>
            {/if}
          </div>
        {/each}
      </fieldset>
    {:else}
      <p class="muted">No fills in this track.</p>
    {/each}
    {#if track.curves.length > 0}
      <button type="button" class="link" onclick={() => add(track)}>Add a fill</button>
    {:else}
      <p class="muted">Add a curve first: a fill needs one.</p>
    {/if}
  </div>
{/if}

<style>
  .fills {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.5rem 0.625rem 0.625rem;
  }

  .head {
    display: flex;
    align-items: baseline;
  }

  .title {
    font-size: 0.875rem;
    font-weight: 600;
  }

  .close {
    margin-left: auto;
    padding: 0 0.25rem;
    font-size: 1rem;
    line-height: 1;
    color: var(--welllog-text-muted);
    background: none;
    border: 0;
    cursor: pointer;
  }

  fieldset {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin: 0;
    padding: 0.375rem 0 0;
    border: 0;
    border-top: 1px solid var(--welllog-border);
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .sides,
  .colour {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.375rem;
  }

  .where {
    flex: 1;
    min-width: 0;
    color: var(--welllog-text-muted);
  }

  p {
    margin: 0;
  }

  .muted {
    color: var(--welllog-text-muted);
  }

  select,
  input[type="number"] {
    padding: 0.125rem 0.25rem;
    font: inherit;
    color: var(--welllog-text);
    background: var(--welllog-bg);
    border: 1px solid var(--welllog-border);
    border-radius: 3px;
  }

  select {
    max-width: 6.5rem;
  }

  input[type="number"] {
    width: 4rem;
    font-variant-numeric: tabular-nums;
  }

  input[type="color"] {
    width: 2rem;
    height: 1.375rem;
    padding: 0;
    background: none;
    border: 1px solid var(--welllog-border);
    border-radius: 3px;
    cursor: pointer;
  }

  input[type="color"]:disabled {
    opacity: 0.35;
    cursor: default;
  }

  label {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    color: var(--welllog-text-muted);
  }

  .drawn {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    color: var(--welllog-text-muted);
  }

  .swatch {
    display: inline-block;
    width: 0.875rem;
    height: 0.875rem;
    border: 1px solid var(--welllog-border);
    border-radius: 2px;
  }

  .remove {
    margin-left: auto;
    padding: 0 0.375rem;
    font: inherit;
    font-size: 0.875rem;
    line-height: 1.3;
    color: var(--welllog-text-muted);
    background: transparent;
    border: 1px solid var(--welllog-border);
    border-radius: 3px;
    cursor: pointer;
  }

  .remove:hover {
    color: var(--welllog-cursor);
    border-color: var(--welllog-cursor);
  }

  .link {
    align-self: flex-start;
    padding: 0;
    font: inherit;
    color: var(--welllog-accent);
    background: none;
    border: 0;
    cursor: pointer;
  }

  button:focus-visible,
  input:focus-visible,
  select:focus-visible {
    outline: 2px solid var(--welllog-accent);
    outline-offset: 1px;
  }
</style>
