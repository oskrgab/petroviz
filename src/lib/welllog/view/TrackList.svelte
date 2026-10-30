<script lang="ts">
  /**
   * The track list panel (#30, #56): the current template's tracks as an
   * ordered list, for restructuring it in one place. Each track can be
   * moved up (left in the view) or down, given a width, reset or removed.
   * A curve track expands into its curves, each opening the same curve
   * editor as its scale bar, the same add-curve picker as its ＋, and its
   * fills. Everything goes through view.edit, so it shows and edits the
   * same current template as the inline controls.
   */

  import CurveEditor from "./CurveEditor.svelte";
  import CurvePicker from "./CurvePicker.svelte";
  import FillEditor from "./FillEditor.svelte";
  import { getLogView } from "./logView.svelte.ts";
  import { entryLabel } from "./template/label.ts";
  import { trackSummary } from "./tracks.ts";
  import { boundedWidth, MAX_TRACK_WIDTH, MIN_TRACK_WIDTH } from "./widths.ts";

  interface Props {
    id: string;
    onclose: () => void;
  }

  let { id, onclose }: Props = $props();

  const view = getLogView();
  const last = $derived(view.resolved.tracks.length - 1);

  /** The curve entry whose editor is open, and the track whose picker is, as `trackId/entryId` and `trackId`. */
  let editing = $state<string | null>(null);
  let picking = $state<string | null>(null);

  function setWidth(trackId: string, text: string) {
    const width = Number(text);
    if (text.trim() === "" || !Number.isFinite(width)) return;
    view.edit({ kind: "set-track-width", trackId, width: boundedWidth(width) });
  }
</script>

<div class="track-list" {id} role="dialog" aria-label="Tracks">
  <div class="panel-head">
    <h2>Tracks</h2>
    <button type="button" class="close" onclick={onclose} aria-label="Close the track list">×</button>
  </div>

  <ol>
    {#each view.resolved.tracks as resolved, i (resolved.track.id)}
      {@const trackId = resolved.track.id}
      {@const summary = trackSummary(resolved)}
      <li>
        <div class="row">
          <span class="title"><b>{summary.kind}</b> {summary.detail}</span>
          <span class="controls">
            <button
              type="button"
              class="icon"
              disabled={i === 0}
              aria-label="Move {summary.kind} {summary.detail} up, to the left"
              title="Move up (left in the view)"
              onclick={() => view.edit({ kind: "move-track", trackId, to: i - 1 })}>↑</button
            >
            <button
              type="button"
              class="icon"
              disabled={i === last}
              aria-label="Move {summary.kind} {summary.detail} down, to the right"
              title="Move down (right in the view)"
              onclick={() => view.edit({ kind: "move-track", trackId, to: i + 1 })}>↓</button
            >
            <label title="Relative width: 1 is a standard track">
              <span>Width</span>
              <input
                type="number"
                step="0.05"
                min={MIN_TRACK_WIDTH}
                max={MAX_TRACK_WIDTH}
                value={resolved.track.width}
                onchange={(event) => setWidth(trackId, event.currentTarget.value)}
              />
            </label>
            <button
              type="button"
              class="icon"
              aria-label="Reset the width of {summary.kind} {summary.detail}"
              title="Reset the width"
              onclick={() => view.edit({ kind: "reset-track-width", trackId })}>↺</button
            >
            <button
              type="button"
              class="icon remove"
              aria-label="Remove {summary.kind} {summary.detail}"
              title="Remove this track"
              onclick={() => view.edit({ kind: "remove-track", trackId })}>×</button
            >
          </span>
        </div>
        {#if resolved.kind === "curve"}
          <details>
            <summary>Curves and fills</summary>
            <ul class="entries">
              {#each resolved.entries as entry (entry.entry.id)}
                {@const key = `${trackId}/${entry.entry.id}`}
                <li>
                  <button
                    type="button"
                    class="entry"
                    class:unmatched={!entry.curve}
                    aria-expanded={editing === key}
                    onclick={() => (editing = editing === key ? null : key)}
                  >
                    {entry.curve?.mnemonic ?? entryLabel(entry.entry)}
                    {#if !entry.curve}<span class="note">not in this well</span>{/if}
                  </button>
                  {#if editing === key}
                    <div class="inline">
                      <CurveEditor {trackId} resolved={entry} onclose={() => (editing = null)} />
                    </div>
                  {/if}
                </li>
              {/each}
            </ul>
            <button
              type="button"
              class="link"
              aria-expanded={picking === trackId}
              onclick={() => (picking = picking === trackId ? null : trackId)}>Add a curve</button
            >
            {#if picking === trackId}
              <div class="inline">
                <CurvePicker {trackId} onclose={() => (picking = null)} />
              </div>
            {/if}
            <h3>Fills</h3>
            <div class="inline">
              <FillEditor {trackId} />
            </div>
          </details>
        {/if}
      </li>
    {:else}
      <li class="none">No tracks. Add one with the ＋ after the tracks.</li>
    {/each}
  </ol>
</div>

<style>
  .track-list {
    position: absolute;
    top: 100%;
    right: 0.5rem;
    z-index: 10;
    width: min(26rem, calc(100vw - 2rem));
    max-height: min(40rem, 75vh);
    overflow-y: auto;
    margin-top: 0.25rem;
    padding: 0.75rem 1rem 1rem;
    background: var(--welllog-header-bg);
    color: var(--welllog-text);
    border: 1px solid var(--welllog-border);
    border-radius: 6px;
    box-shadow: 0 10px 24px rgb(15 23 42 / 0.18);
    font-size: 0.8125rem;
  }

  .panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  h2 {
    margin: 0;
    font-size: 0.9375rem;
    font-weight: 600;
  }

  h3 {
    margin: 0.5rem 0 0;
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--welllog-text-muted);
  }

  .close {
    border: none;
    background: none;
    color: var(--welllog-text-muted);
    font-size: 1.25rem;
    line-height: 1;
    cursor: pointer;
    padding: 0.125rem 0.375rem;
  }

  .close:hover {
    color: var(--welllog-text);
  }

  ol,
  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  ol > li {
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--welllog-border);
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem 0.5rem;
  }

  .title {
    flex: 1 1 8rem;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    color: var(--welllog-text-muted);
  }

  .title b {
    color: var(--welllog-text);
  }

  .controls {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
  }

  label {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    color: var(--welllog-text-muted);
  }

  input[type="number"] {
    width: 3.75rem;
    padding: 0.125rem 0.25rem;
    font: inherit;
    font-variant-numeric: tabular-nums;
    color: var(--welllog-text);
    background: var(--welllog-bg);
    border: 1px solid var(--welllog-border);
    border-radius: 3px;
  }

  .icon {
    min-width: 1.5rem;
    padding: 0.0625rem 0.25rem;
    font: inherit;
    line-height: 1.3;
    color: var(--welllog-text);
    background: transparent;
    border: 1px solid var(--welllog-border);
    border-radius: 3px;
    cursor: pointer;
  }

  .icon:disabled {
    color: var(--welllog-text-muted);
    opacity: 0.5;
    cursor: default;
  }

  .icon:hover:not(:disabled) {
    border-color: var(--welllog-accent);
  }

  .remove:hover:not(:disabled) {
    color: var(--welllog-cursor);
    border-color: var(--welllog-cursor);
  }

  details {
    margin-top: 0.25rem;
  }

  summary {
    color: var(--welllog-text-muted);
    cursor: pointer;
  }

  .entries {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    margin: 0.25rem 0;
  }

  .entry,
  .link {
    padding: 0.125rem 0;
    font: inherit;
    text-align: left;
    background: none;
    border: 0;
    cursor: pointer;
  }

  .entry {
    font-weight: 600;
    color: var(--welllog-text);
  }

  .entry.unmatched {
    font-weight: inherit;
    color: var(--welllog-text-muted);
  }

  .link {
    color: var(--welllog-accent);
  }

  .note {
    margin-left: 0.25rem;
    font-size: 0.6875rem;
    font-weight: normal;
    color: var(--welllog-text-muted);
  }

  /* An editor, picker or fill list opened inside the panel, framed as the popups are. */
  .inline {
    margin: 0.25rem 0;
    font-size: 0.75rem;
    line-height: 1.35;
    border: 1px solid var(--welllog-border);
    border-radius: 6px;
  }

  .none {
    color: var(--welllog-text-muted);
  }

  button:focus-visible,
  input:focus-visible,
  summary:focus-visible {
    outline: 2px solid var(--welllog-accent);
    outline-offset: 1px;
  }
</style>
