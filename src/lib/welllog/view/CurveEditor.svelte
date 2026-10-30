<script lang="ts">
  /**
   * The curve editor (#30, #55): what a click or tap on a scale bar opens.
   * It edits one curve entry of the current template through view.edit, so
   * each change draws at once and outlives the well log.
   *
   * At its top, all of the curve's load warnings, notes included, so a
   * caution never depends on hover (#34); then the curve's range and the %
   * missing inside it. Then the controls: scale ends, linear or log, wrap or
   * clip, colour, width, dash, and remove.
   *
   * Typed scale ends become fixed ends in the curve's unit. Computed ends
   * show what they come to on this well log, and say how they are computed.
   * The colour control shows the stored colour, and beside it the colour
   * it is drawn in when that differs (on a dark track, ADR-0006).
   *
   * An entry that matched nothing can still be styled or removed; its fixed
   * ends show as written.
   */

  import { severityOf, type LoadWarningCode } from "../core/index.ts";
  import { describeComputedEnds, formatCoverage, formatScaleEnd } from "./format.ts";
  import type { ResolvedEntry } from "./kinds/index.ts";
  import { getLogView } from "./logView.svelte.ts";
  import { curveCoverage, curveWarnings } from "./quality.ts";
  import { endsAreValid, percentileScale, scaleWithType, type EntryChange } from "./template/edit.ts";
  import { entryLabel } from "./template/label.ts";
  import type { Dash, ScaleType } from "./template/types.ts";

  interface Props {
    trackId: string;
    resolved: ResolvedEntry;
    onclose: () => void;
  }

  let { trackId, resolved, onclose }: Props = $props();

  const view = getLogView();
  const id = $props.id();

  const DASH_NAMES: Record<Dash, string> = { solid: "Solid", dashed: "Dashed", dotted: "Dotted", dashdot: "Dash-dot" };
  const WIDTHS = [0.5, 1, 1.5, 2, 3] as const;

  const entry = $derived(resolved.entry);
  const curve = $derived(resolved.curve);
  const warnings = $derived(curve ? curveWarnings(view.log, curve.key) : []);
  const coverage = $derived(curve && curveCoverage(view.log.md, curve.values));
  const drawn = $derived(view.strokeColour(entry.style.colour));
  const drawnDiffers = $derived(drawn.toUpperCase() !== entry.style.colour.toUpperCase());

  /** The ends as they stand: on this curve, else as written when fixed, else unknown. */
  const shownEnds = $derived.by(() => {
    if (resolved.scale) return { left: resolved.scale.left, right: resolved.scale.right, unit: curve?.unit ?? "" };
    const { ends } = entry.scale;
    return ends.kind === "fixed" ? ends : null;
  });

  let endsError = $state(false);
  let leftInput: HTMLInputElement;
  let rightInput: HTMLInputElement;

  function change(edit: EntryChange) {
    view.edit({ ...edit, trackId, entryId: entry.id });
  }

  function commitTypedEnds() {
    const left = Number(leftInput.value.trim() === "" ? NaN : leftInput.value);
    const right = Number(rightInput.value.trim() === "" ? NaN : rightInput.value);
    const type = entry.scale.type;
    endsError = !endsAreValid({ left, right, type });
    if (endsError || (shownEnds && left === shownEnds.left && right === shownEnds.right)) return;
    const unit = curve?.unit ?? (entry.scale.ends.kind === "fixed" ? entry.scale.ends.unit : "");
    change({ kind: "set-scale", scale: { type, ends: { kind: "fixed", left, right, unit } } });
  }

  function setType(type: ScaleType) {
    endsError = false;
    change({ kind: "set-scale", scale: scaleWithType(entry.scale, type) });
  }

  function computeEnds() {
    endsError = false;
    const reversed = shownEnds ? shownEnds.left > shownEnds.right : false;
    change({ kind: "set-scale", scale: percentileScale(entry.scale.type, reversed) });
  }

  const endsSource = $derived(describeComputedEnds(entry.scale.ends, entry.scale.type));

  function remove() {
    change({ kind: "remove-entry" });
    onclose();
  }

  const isCaution = (code: LoadWarningCode) => severityOf(code) === "caution";
</script>

<div class="editor">
  <div class="head">
    <span class="name" style:color={drawn}>{curve?.mnemonic ?? entryLabel(entry)}</span>
    {#if curve}
      <span class="muted">{curve.unit}{curve.description ? ` · ${curve.description}` : ""}</span>
    {:else}
      <span class="muted">not in this well</span>
    {/if}
    <button type="button" class="close" aria-label="Close the curve editor" onclick={onclose}>×</button>
  </div>

  {#if warnings.length > 0}
    <ul class="warnings" aria-label="Load warnings">
      {#each warnings as warning, i (i)}
        <li class:caution={isCaution(warning.code)}>
          <span class="mark" aria-label={isCaution(warning.code) ? "Caution" : "Note"}>{isCaution(warning.code) ? "⚠" : "ℹ"}</span>
          <span>{warning.message}</span>
        </li>
      {/each}
    </ul>
  {/if}

  {#if coverage}
    <p class="coverage">{formatCoverage(coverage, view.log.depthUnit)}</p>
  {/if}

  <fieldset>
    <legend>Scale</legend>
    <div class="ends">
      <label>
        <span>Left</span>
        <input
          type="number"
          step="any"
          value={shownEnds ? formatScaleEnd(shownEnds.left) : ""}
          placeholder="computed"
          aria-invalid={endsError}
          aria-describedby={endsError ? `${id}-ends-error` : undefined}
          bind:this={leftInput}
          onchange={commitTypedEnds}
        />
      </label>
      <label>
        <span>Right</span>
        <input
          type="number"
          step="any"
          value={shownEnds ? formatScaleEnd(shownEnds.right) : ""}
          placeholder="computed"
          aria-invalid={endsError}
          aria-describedby={endsError ? `${id}-ends-error` : undefined}
          bind:this={rightInput}
          onchange={commitTypedEnds}
        />
      </label>
      {#if shownEnds?.unit}<span class="muted unit">{shownEnds.unit}</span>{/if}
    </div>
    {#if endsError}
      <p class="error" id="{id}-ends-error">
        The ends must be numbers that differ{entry.scale.type === "log" ? ", both above 0 on a log scale" : ""}.
      </p>
    {/if}
    {#if endsSource}
      <p class="muted">{endsSource}</p>
    {:else}
      <button type="button" class="link" onclick={computeEnds}>Compute from the whole curve</button>
    {/if}
    <div class="choice" role="group" aria-label="Scale type">
      {#each [["linear", "Linear"], ["log", "Log"]] as const as [type, name] (type)}
        <button type="button" aria-pressed={entry.scale.type === type} onclick={() => setType(type)}>{name}</button>
      {/each}
    </div>
    <div class="choice" role="group" aria-label="Off-scale values">
      <button
        type="button"
        aria-pressed={entry.offScale === "wrap"}
        title="Draw off-scale values shifted back by one scale width, lighter"
        onclick={() => change({ kind: "set-off-scale", offScale: "wrap" })}>Wrap</button
      >
      <button
        type="button"
        aria-pressed={entry.offScale === "clip"}
        title="Cut the line where it leaves the scale"
        onclick={() => change({ kind: "set-off-scale", offScale: "clip" })}>Clip</button
      >
    </div>
  </fieldset>

  <fieldset>
    <legend>Line</legend>
    <div class="colour">
      <label>
        <span>Colour</span>
        <input
          type="color"
          value={entry.style.colour.toLowerCase()}
          oninput={(event) => change({ kind: "set-style", style: { colour: event.currentTarget.value.toUpperCase() } })}
        />
      </label>
      <code>{entry.style.colour.toUpperCase()}</code>
      {#if drawnDiffers}
        <span class="drawn" title="Template colours are written for a light track and adapted on a dark one">
          drawn on dark as <span class="swatch" style:background={drawn}></span>
          <code>{drawn.toUpperCase()}</code>
        </span>
      {/if}
    </div>
    <div class="line">
      <label>
        <span>Width</span>
        <select
          value={entry.style.width}
          onchange={(event) => change({ kind: "set-style", style: { width: Number(event.currentTarget.value) } })}
        >
          {#if !(WIDTHS as readonly number[]).includes(entry.style.width)}
            <option value={entry.style.width}>{entry.style.width} px</option>
          {/if}
          {#each WIDTHS as width (width)}
            <option value={width}>{width} px</option>
          {/each}
        </select>
      </label>
      <label>
        <span>Dash</span>
        <select
          value={entry.style.dash}
          onchange={(event) => change({ kind: "set-style", style: { dash: event.currentTarget.value as Dash } })}
        >
          {#each Object.entries(DASH_NAMES) as [dash, name] (dash)}
            <option value={dash}>{name}</option>
          {/each}
        </select>
      </label>
    </div>
  </fieldset>

  <div class="foot">
    <button type="button" class="remove" onclick={remove}>Remove from track</button>
  </div>
</div>

<style>
  .editor {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.5rem 0.625rem 0.625rem;
  }

  .head {
    display: flex;
    align-items: baseline;
    gap: 0.375rem;
    min-width: 0;
  }

  .name {
    font-size: 0.875rem;
    font-weight: 600;
  }

  .head .muted {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .muted {
    color: var(--welllog-text-muted);
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

  .warnings {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin: 0;
    padding: 0.375rem 0.5rem;
    list-style: none;
    border: 1px solid var(--welllog-border);
    border-radius: 4px;
  }

  .warnings li {
    display: flex;
    gap: 0.375rem;
    color: var(--welllog-text-muted);
  }

  .warnings li.caution {
    color: var(--welllog-text);
  }

  .mark {
    flex: none;
  }

  .caution .mark {
    color: var(--welllog-caution);
  }

  p {
    margin: 0;
  }

  .coverage {
    font-variant-numeric: tabular-nums;
    color: var(--welllog-text-muted);
  }

  fieldset {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    margin: 0;
    padding: 0.375rem 0 0;
    border: 0;
    border-top: 1px solid var(--welllog-border);
  }

  legend {
    padding: 0 0.25rem 0 0;
    font-weight: 600;
  }

  label {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
  }

  label > span {
    color: var(--welllog-text-muted);
  }

  .ends,
  .line,
  .colour {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
  }

  input[type="number"] {
    width: 4.25rem;
  }

  input[type="number"],
  select {
    padding: 0.125rem 0.25rem;
    font: inherit;
    font-variant-numeric: tabular-nums;
    color: var(--welllog-text);
    background: var(--welllog-bg);
    border: 1px solid var(--welllog-border);
    border-radius: 3px;
  }

  input[aria-invalid="true"] {
    border-color: var(--welllog-cursor);
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

  .error {
    color: var(--welllog-cursor);
  }

  .choice {
    display: inline-flex;
    align-self: flex-start;
  }

  .choice button,
  .remove {
    padding: 0.125rem 0.5rem;
    font: inherit;
    color: var(--welllog-text);
    background: transparent;
    border: 1px solid var(--welllog-border);
    cursor: pointer;
  }

  .choice button:first-child {
    border-radius: 3px 0 0 3px;
  }

  .choice button + button {
    margin-left: -1px;
    border-radius: 0 3px 3px 0;
  }

  /* Raised, so its border shows over the neighbour it overlaps. */
  .choice button[aria-pressed="true"] {
    position: relative;
    color: var(--welllog-accent);
    border-color: var(--welllog-accent);
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

  code {
    font-size: 0.6875rem;
  }

  .foot {
    display: flex;
    justify-content: flex-end;
    padding-top: 0.375rem;
    border-top: 1px solid var(--welllog-border);
  }

  .remove {
    border-radius: 3px;
  }

  .remove:hover {
    color: var(--welllog-cursor);
    border-color: var(--welllog-cursor);
  }

  button:focus-visible,
  input:focus-visible,
  select:focus-visible {
    outline: 2px solid var(--welllog-accent);
    outline-offset: 1px;
  }
</style>
