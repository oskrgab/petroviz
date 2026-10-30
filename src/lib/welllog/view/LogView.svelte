<script lang="ts">
  /**
   * LogView
   *
   * The display of one well log (ADR-0004). It accepts a WellLog and nothing
   * else: the host does the loading and shows the loading and error states.
   *
   * For now it is the shell: a top bar starting with the well panel control,
   * which carries an amber badge counting cautions, and only when there are
   * some. Nothing opens on load. Tracks join it next.
   *
   * Colours come in as --welllog-* custom properties. Their light and dark
   * values are set here per `scheme`, and a host may override any of them.
   */

  import type { WellLog } from "../core/index.ts";
  import WellPanel from "./WellPanel.svelte";
  import { cautionCount } from "./wellPanel.ts";

  interface Props {
    log: WellLog;
    scheme?: "light" | "dark";
  }

  let { log, scheme = "light" }: Props = $props();

  let panelOpen = $state(false);
  const cautions = $derived(cautionCount(log));
  const panelId = $props.id();

  function onkeydown(event: KeyboardEvent) {
    if (event.key === "Escape" && panelOpen) panelOpen = false;
  }
</script>

<svelte:window {onkeydown} />

<div class="log-view" data-scheme={scheme}>
  <div class="top-bar">
    <button
      type="button"
      class="well-control"
      aria-expanded={panelOpen}
      aria-controls={panelId}
      onclick={() => (panelOpen = !panelOpen)}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path
          fill="currentColor"
          d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1Zm0 3.25a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8ZM9.25 12h-2.5v-1h.75V8h-.75V7h1.75v4h.75v1Z"
        />
      </svg>
      Well
      {#if cautions > 0}
        <span class="badge" aria-label={`${cautions} ${cautions === 1 ? "caution" : "cautions"}`}>{cautions}</span>
      {/if}
    </button>
    {#if panelOpen}
      <WellPanel {log} id={panelId} onclose={() => (panelOpen = false)} />
    {/if}
  </div>

  <div class="body"></div>
</div>

<style>
  /* Lowest specificity, so a host can override any token. */
  :where(.log-view) {
    --welllog-bg: #ffffff;
    --welllog-header-bg: #ffffff;
    --welllog-depth-bg: #f1f5f9;
    --welllog-grid: #e2e8f0;
    --welllog-grid-major: #cbd5e1;
    --welllog-border: #cbd5e1;
    --welllog-text: #0f172a;
    --welllog-text-muted: #64748b;
    --welllog-cursor: #dc2626;
    --welllog-window: #0284c7;
    --welllog-accent: #0284c7;
    --welllog-caution: #b45309;
    --welllog-caution-ink: #ffffff;
    --welllog-gap-hatch: #94a3b8;
    --welllog-no-data: #94a3b8;
    --welllog-zone-line: #475569;
  }

  :where(.log-view[data-scheme="dark"]) {
    --welllog-bg: #0f172a;
    --welllog-header-bg: #1e293b;
    --welllog-depth-bg: #162033;
    --welllog-grid: #1f2a3d;
    --welllog-grid-major: #334155;
    --welllog-border: #334155;
    --welllog-text: #e2e8f0;
    --welllog-text-muted: #94a3b8;
    --welllog-cursor: #f87171;
    --welllog-window: #38bdf8;
    --welllog-accent: #38bdf8;
    --welllog-caution: #fbbf24;
    --welllog-caution-ink: #1c1917;
    --welllog-gap-hatch: #64748b;
    --welllog-no-data: #64748b;
    --welllog-zone-line: #0f172a;
  }

  .log-view {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    background: var(--welllog-bg);
    color: var(--welllog-text);
    border: 1px solid var(--welllog-border);
    border-radius: 6px;
  }

  .top-bar {
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 0.5rem;
    background: var(--welllog-header-bg);
    border-bottom: 1px solid var(--welllog-border);
    border-radius: 6px 6px 0 0;
  }

  .well-control {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.25rem 0.625rem;
    font: inherit;
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--welllog-text);
    background: transparent;
    border: 1px solid var(--welllog-border);
    border-radius: 4px;
    cursor: pointer;
  }

  .well-control:hover,
  .well-control[aria-expanded="true"] {
    border-color: var(--welllog-accent);
  }

  .well-control:focus-visible {
    outline: 2px solid var(--welllog-accent);
    outline-offset: 1px;
  }

  .well-control svg {
    width: 0.9375rem;
    height: 0.9375rem;
    color: var(--welllog-text-muted);
  }

  .badge {
    min-width: 1.125rem;
    padding: 0 0.3125rem;
    border-radius: 999px;
    background: var(--welllog-caution);
    color: var(--welllog-caution-ink);
    font-size: 0.6875rem;
    font-weight: 600;
    line-height: 1.125rem;
    text-align: center;
  }

  .body {
    flex: 1;
    min-height: 0;
  }
</style>
