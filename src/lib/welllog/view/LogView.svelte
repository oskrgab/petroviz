<script lang="ts">
  /**
   * LogView
   *
   * The display of one well log (ADR-0004): a controlled component. It
   * accepts a WellLog and nothing else, and the host does the loading and
   * shows the loading and error states. `template`, `interval` and
   * `depthRef` are bound, and written only on a user action; what is drawn
   * is derived from them by resolveTemplate.
   *
   * A top bar starts with the well panel control, which carries an amber
   * badge counting cautions, and only when there are some, then the exact
   * interval and the zoom buttons. Below it, the overview strip on the left,
   * then the tracks side by side over the visible interval, one canvas each,
   * scrolling sideways past the overview when they can't fit. Wheel, drag
   * and pinch on the tracks move the interval (gestures.ts).
   *
   * Colours come in as --welllog-* custom properties. Their light and dark
   * values are set here per `scheme`, and a host may override any of them.
   */

  import type { WellLog } from "../core/index.ts";
  import { readTokens } from "./canvas.ts";
  import { depthGestures } from "./gestures.ts";
  import IntervalInput from "./IntervalInput.svelte";
  import type { DepthInterval, DepthRef } from "./interval.ts";
  import { headerFor } from "./kinds/headers.ts";
  import { trackColumns } from "./widths.ts";
  import { LogViewState, setLogView } from "./logView.svelte.ts";
  import { overviewCurve } from "./navigation.ts";
  import Overview from "./Overview.svelte";
  import { defaultTemplate } from "./template/defaults.ts";
  import type { Template } from "./template/types.ts";
  import TrackCanvas from "./TrackCanvas.svelte";
  import WellPanel from "./WellPanel.svelte";
  import { cautionCount } from "./wellPanel.ts";

  interface Props {
    log: WellLog;
    template?: Template;
    /** In MD; null shows the whole well. */
    interval?: DepthInterval | null;
    depthRef?: DepthRef;
    scheme?: "light" | "dark";
  }

  let {
    log,
    template = $bindable(defaultTemplate()),
    interval = $bindable(null),
    depthRef = $bindable("md"),
    scheme = "light",
  }: Props = $props();

  const view = setLogView(
    new LogViewState(
      {
        get log() {
          return log;
        },
        get template() {
          return template;
        },
        get interval() {
          return interval;
        },
        get depthRef() {
          return depthRef;
        },
      },
      (next) => (interval = next),
    ),
  );

  let root: HTMLDivElement;
  let panelOpen = $state(false);
  /** The overview strip's width, in CSS px. */
  const OVERVIEW_PX = 56;
  const cautions = $derived(cautionCount(log));
  const columns = $derived(`${OVERVIEW_PX}px ${trackColumns(template.tracks)}`);
  const overviewLabel = $derived([overviewCurve(log)?.mnemonic, log.zoneSets[0]?.name].filter(Boolean).join(" · "));
  const panelId = $props.id();

  // The tokens resolve per scheme, so read them again when it changes.
  $effect(() => {
    void scheme;
    view.tokens = readTokens(root);
  });

  $effect(() => () => view.destroy());

  function onkeydown(event: KeyboardEvent) {
    if (event.key === "Escape" && panelOpen) panelOpen = false;
  }
</script>

<svelte:window {onkeydown} />

<div class="log-view" data-scheme={scheme} bind:this={root}>
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
    <IntervalInput />
  </div>

  <div class="tracks">
    <div class="track-grid" style:grid-template-columns={columns} {@attach depthGestures(view)}>
      <div class="overview-header" title="Overview of the whole well">{overviewLabel}</div>
      <div class="overview-body">
        <Overview />
      </div>
      {#each view.resolved.tracks as resolved (resolved.track.id)}
        {@const Header = headerFor(resolved)}
        <div class="track-header" class:depth={resolved.kind === "depth"}>
          <Header {resolved} />
        </div>
        <div
          class="track-body"
          class:depth={resolved.kind === "depth"}
          class:zone={resolved.kind === "zone"}
          data-track-body={resolved.track.id}
        >
          <TrackCanvas {resolved} />
        </div>
      {/each}
    </div>
  </div>
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
    flex-wrap: wrap;
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

  .tracks {
    flex: 1;
    min-height: 0;
    overflow-x: auto;
    overflow-y: hidden;
    border-radius: 0 0 6px 6px;
  }

  /* Column-major: each track is a header over a body. */
  .track-grid {
    display: grid;
    grid-auto-flow: column;
    grid-template-rows: auto minmax(0, 1fr);
    width: 100%;
    min-width: min-content;
    height: 100%;
  }

  .track-header {
    background: var(--welllog-header-bg);
    border-bottom: 1px solid var(--welllog-border);
    min-width: 0;
  }

  .track-body {
    min-width: 0;
    min-height: 0;
  }

  /* Every track after the first; the overview's own border sets off the first. */
  .track-header:nth-child(n + 5),
  .track-body:nth-child(n + 5) {
    border-left: 1px solid var(--welllog-border);
  }

  /* Pan by dragging, zoom by pinching; sideways touch scrolls the track row. */
  .track-body {
    cursor: grab;
    touch-action: pan-x;
  }

  .track-body.zone {
    cursor: pointer;
  }

  .track-grid:global([data-dragging]) .track-body {
    cursor: grabbing;
  }

  /* The overview stays put while the tracks scroll sideways under it. */
  .overview-header,
  .overview-body {
    position: sticky;
    left: 0;
    z-index: 1;
    min-width: 0;
    border-right: 1px solid var(--welllog-border);
  }

  .overview-header {
    display: flex;
    align-items: flex-end;
    justify-content: center;
    padding: 0.25rem 0.125rem 0.375rem;
    overflow: hidden;
    font-size: 0.625rem;
    line-height: 1.2;
    text-align: center;
    color: var(--welllog-text-muted);
    background: var(--welllog-header-bg);
    border-bottom: 1px solid var(--welllog-border);
  }

  .overview-body {
    min-height: 0;
    background: var(--welllog-bg);
  }

  .track-body.depth {
    background: var(--welllog-depth-bg);
  }
</style>
