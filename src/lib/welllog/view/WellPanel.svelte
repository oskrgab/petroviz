<script lang="ts">
  /**
   * WellPanel
   *
   * What the well panel control opens: the well's identity, its load
   * warnings (cautions first, then notes grouped by code) and its header
   * items in file order (#34).
   */

  import type { WellLog } from "../core/index.ts";
  import { identityRows, warningSections } from "./wellPanel.ts";

  interface Props {
    log: WellLog;
    id: string;
    onclose: () => void;
  }

  let { log, id, onclose }: Props = $props();

  const identity = $derived(identityRows(log));
  const sections = $derived(warningSections(log.warnings));
</script>

<div class="well-panel" {id} role="dialog" aria-label="Well">
  <div class="panel-head">
    <h2>{log.well.name}</h2>
    <button type="button" class="close" onclick={onclose} aria-label="Close the well panel">×</button>
  </div>

  <section>
    <h3>Identity</h3>
    <dl class="identity">
      {#each identity as [label, value] (label)}
        <dt>{label}</dt>
        <dd>{value}</dd>
      {/each}
    </dl>
  </section>

  <section>
    <h3>Load warnings</h3>
    {#if sections.cautions.length === 0 && sections.notes.length === 0}
      <p class="empty">None. The source was read as it is.</p>
    {:else}
      <ul class="warnings">
        {#each sections.cautions as caution, i (i)}
          <li class="caution">
            <span class="mark" aria-label="Caution">⚠</span>
            <span>{caution.message}</span>
            {#if caution.curveKey}<code>{caution.curveKey}</code>{/if}
            {#if caution.count !== undefined}<span class="count">{caution.count}</span>{/if}
          </li>
        {/each}
        {#each sections.notes as note (note.code)}
          <li class="note">
            {#if note.items.length === 1 && note.items[0].curveKey === undefined}
              <span class="plain-note">{note.summary}</span>
            {:else}
              <details>
                <summary>{note.summary}</summary>
                <ul class="items">
                  {#each note.items as item, i (i)}
                    <li>
                      {#if item.curveKey}
                        <code>{item.curveKey}</code>
                        {#if item.count !== undefined}<span class="count">{item.count}</span>{/if}
                      {:else}
                        {item.message}
                      {/if}
                    </li>
                  {/each}
                </ul>
              </details>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <section>
    <h3>Header</h3>
    {#if log.header.length === 0}
      <p class="empty">This well log has no header items.</p>
    {:else}
      <table class="header-items">
        <thead>
          <tr><th>Mnemonic</th><th>Unit</th><th>Value</th><th>Description</th></tr>
        </thead>
        <tbody>
          {#each log.header as item, i (i)}
            <tr>
              <td><code>{item.mnemonic}</code></td>
              <td>{item.unit}</td>
              <td>{item.value}</td>
              <td>{item.description}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </section>
</div>

<style>
  .well-panel {
    position: absolute;
    top: 100%;
    left: 0;
    z-index: 10;
    width: min(28rem, calc(100vw - 2rem));
    max-height: min(32rem, 70vh);
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
    margin: 0.875rem 0 0.375rem;
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

  .identity {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 0.25rem 1rem;
    margin: 0;
  }

  dt {
    color: var(--welllog-text-muted);
  }

  dd {
    margin: 0;
    font-variant-numeric: tabular-nums;
  }

  .empty {
    margin: 0;
    color: var(--welllog-text-muted);
  }

  .warnings,
  .items {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .warnings > li {
    padding: 0.25rem 0;
  }

  .caution {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.375rem;
  }

  .mark {
    color: var(--welllog-caution);
  }

  .count {
    color: var(--welllog-text-muted);
    font-variant-numeric: tabular-nums;
  }

  summary {
    cursor: pointer;
  }

  /* Lines up with the text of an expandable note, past its marker. */
  .plain-note {
    padding-left: 1.125rem;
  }

  .items {
    padding: 0.25rem 0 0.125rem 1.125rem;
  }

  .items li {
    display: flex;
    gap: 0.5rem;
    padding: 0.0625rem 0;
  }

  code {
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 0.75rem;
  }

  .header-items {
    width: 100%;
    border-collapse: collapse;
  }

  .header-items th {
    text-align: left;
    font-weight: 500;
    color: var(--welllog-text-muted);
  }

  .header-items th,
  .header-items td {
    padding: 0.125rem 0.5rem 0.125rem 0;
    border-bottom: 1px solid var(--welllog-grid);
    vertical-align: top;
  }
</style>
