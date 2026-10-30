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
   * Over the tracks, a depth cursor line follows the pointer (cursor.ts),
   * moved by a CSS transform so it redraws no canvas, and the headers read
   * every track at its depth. A top bar toggle, not kept, adds the floating
   * readout card beside the pointer.
   *
   * The current template is edited in place, with no edit mode (#30, #55,
   * #56): a click on a scale bar opens that curve's editor, and the ＋ that
   * shows on a curve track under the pointer opens its add-curve picker.
   * With a mouse, a header dragged sideways reorders its track and a
   * track's right border resizes it (double-click resets it); × removes the
   * track. The ⋯ menu moves tracks on touch, and opens a curve track's
   * fills. The ＋ after the tracks adds one. Only one of these popups
   * is open at a time (view.popup). The Tracks control in the top bar opens
   * the track list panel, which edits the same current template.
   *
   * Colours come in as --welllog-* custom properties. Their light and dark
   * values are set here per `scheme`, and a host may override any of them.
   */

  import type { WellLog } from "../core/index.ts";
  import AddTrackMenu from "./AddTrackMenu.svelte";
  import { readTokens } from "./canvas.ts";
  import CurveEditor from "./CurveEditor.svelte";
  import CurvePicker from "./CurvePicker.svelte";
  import { depthCursor } from "./cursor.ts";
  import FillEditor from "./FillEditor.svelte";
  import { depthGestures } from "./gestures.ts";
  import IntervalInput from "./IntervalInput.svelte";
  import type { DepthInterval, DepthRef } from "./interval.ts";
  import { headerFor } from "./kinds/headers.ts";
  import { trackColumns } from "./widths.ts";
  import { LogViewState, setLogView } from "./logView.svelte.ts";
  import { overviewCurve } from "./navigation.ts";
  import Overview from "./Overview.svelte";
  import Popup from "./Popup.svelte";
  import { borderResize, headerDrag } from "./rearrange.ts";
  import ReadoutCard from "./ReadoutCard.svelte";
  import { defaultTemplate } from "./template/defaults.ts";
  import type { Template } from "./template/types.ts";
  import TrackCanvas from "./TrackCanvas.svelte";
  import TrackList from "./TrackList.svelte";
  import TrackMenu from "./TrackMenu.svelte";
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
      {
        interval: (next) => (interval = next),
        template: (next) => (template = next),
      },
    ),
  );

  let root: HTMLDivElement;
  let tracksRow: HTMLDivElement;
  /** The panel open below the top bar, if any: the well panel or the track list. */
  let panel = $state<"well" | "tracks" | null>(null);
  let cardOn = $state(false);
  /** The overview strip's width, and that of the ＋ after the tracks, in CSS px. */
  const OVERVIEW_PX = 56;
  const ADD_TRACK_PX = 28;
  const cautions = $derived(cautionCount(log));
  /** A border being dragged shows its width before the template takes it. */
  const widths = $derived(
    template.tracks.map((track) => (view.resizing?.trackId === track.id ? view.resizing : track)),
  );
  const columns = $derived(`${OVERVIEW_PX}px ${trackColumns(widths)} ${ADD_TRACK_PX}px`);
  /** The room the tracks have, for a border drag. */
  const available = () => tracksRow.clientWidth - OVERVIEW_PX - ADD_TRACK_PX;
  const overviewLabel = $derived([overviewCurve(log)?.mnemonic, log.zoneSets[0]?.name].filter(Boolean).join(" · "));
  const panelId = $props.id();
  const trackListId = `${panelId}-tracks`;
  /** The track under the pointer, header or body, whose ＋ shows. */
  let hoveredTrack = $state<string | null>(null);

  // An entry or track removed while its popup is open takes the popup with it.
  $effect(() => {
    const popup = view.popup;
    if (!popup || popup.kind === "add-track") return;
    const gone =
      popup.kind === "editor" ? !view.editing : !view.resolved.tracks.some((t) => t.track.id === popup.trackId);
    if (gone) view.popup = null;
  });

  const togglePanel = (which: "well" | "tracks") => (panel = panel === which ? null : which);

  const hover = (trackId: string) => ({
    onpointerenter: () => (hoveredTrack = trackId),
    onpointerleave: () => {
      if (hoveredTrack === trackId) hoveredTrack = null;
    },
  });

  // The tokens resolve per scheme, so read them again when it changes.
  $effect(() => {
    void scheme;
    view.tokens = readTokens(root);
  });

  $effect(() => () => view.destroy());

  function onkeydown(event: KeyboardEvent) {
    if (event.key === "Escape" && panel) panel = null;
  }
</script>

<svelte:window {onkeydown} />

<div class="log-view" data-scheme={scheme} bind:this={root}>
  <div class="top-bar">
    <button
      type="button"
      class="bar-button well-control"
      aria-expanded={panel === "well"}
      aria-controls={panelId}
      onclick={() => togglePanel("well")}
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
    {#if panel === "well"}
      <WellPanel {log} id={panelId} onclose={() => (panel = null)} />
    {/if}
    <IntervalInput />
    <button
      type="button"
      class="bar-button card-toggle"
      aria-pressed={cardOn}
      title="Show the depth cursor's readout beside the pointer"
      onclick={() => (cardOn = !cardOn)}
    >
      Readout card
    </button>
    <button
      type="button"
      class="bar-button tracks-control"
      aria-expanded={panel === "tracks"}
      aria-controls={trackListId}
      title="List the tracks, to reorder, resize, remove or edit them"
      onclick={() => togglePanel("tracks")}
    >
      Tracks
    </button>
    {#if panel === "tracks"}
      <TrackList id={trackListId} onclose={() => (panel = null)} />
    {/if}
  </div>

  <div class="tracks" bind:this={tracksRow}>
    <div
      class="track-grid"
      style:grid-template-columns={columns}
      {@attach depthGestures(view)}
      {@attach depthCursor(view)}
      {@attach headerDrag(view)}
    >
      <div class="overview-header" title="Overview of the whole well">{overviewLabel}</div>
      <div class="overview-body">
        <Overview />
      </div>
      {#each view.resolved.tracks as resolved (resolved.track.id)}
        {@const Header = headerFor(resolved)}
        {@const trackId = resolved.track.id}
        {@const dragged = view.dragging?.trackId === trackId ? view.dragging : null}
        {@const popupHere = view.popup && "trackId" in view.popup && view.popup.trackId === trackId}
        <div
          class="track-header"
          class:depth={resolved.kind === "depth"}
          class:dragged
          style:transform={dragged ? `translateX(${dragged.dx}px)` : undefined}
          data-track-header={trackId}
          {...hover(trackId)}
        >
          <Header {resolved} />
          <div class="track-controls" class:shown={hoveredTrack === trackId || popupHere} data-no-header-drag>
            {#if resolved.kind === "curve"}
              <button
                type="button"
                aria-label="Add a curve to this track"
                aria-haspopup="dialog"
                title="Add a curve"
                data-popup-anchor
                onclick={(event) => view.togglePopup({ kind: "picker", trackId, anchor: event.currentTarget })}
              >
                ＋
              </button>
            {/if}
            <button
              type="button"
              aria-label="Track menu"
              aria-haspopup="dialog"
              title="Move, reset or remove this track{resolved.kind === 'curve' ? ', or edit its fills' : ''}"
              data-popup-anchor
              onclick={(event) => view.togglePopup({ kind: "track-menu", trackId, anchor: event.currentTarget })}
            >
              ⋯
            </button>
            <button
              type="button"
              class="remove-track"
              aria-label="Remove this track"
              title="Remove this track"
              onclick={() => view.edit({ kind: "remove-track", trackId })}
            >
              ×
            </button>
          </div>
          <div
            class="border-handle"
            title="Drag to resize; double-click to reset"
            aria-hidden="true"
            data-no-header-drag
            {@attach borderResize(view, trackId, available)}
          ></div>
        </div>
        <div
          class="track-body"
          class:depth={resolved.kind === "depth"}
          class:zone={resolved.kind === "zone"}
          data-track-body={trackId}
          {...hover(trackId)}
        >
          <TrackCanvas {resolved} />
        </div>
      {/each}
      <div class="add-track">
        <button
          type="button"
          aria-label="Add a track"
          aria-haspopup="dialog"
          title="Add a track"
          data-popup-anchor
          onclick={(event) => view.togglePopup({ kind: "add-track", anchor: event.currentTarget })}
        >
          ＋
        </button>
      </div>
      {#if view.dragging && view.dragging.to !== template.tracks.findIndex((t) => t.id === view.dragging?.trackId)}
        <div class="drop-edge" aria-hidden="true" style:left="{view.dragging.edge}px"></div>
      {/if}
      <div
        class="cursor"
        aria-hidden="true"
        hidden={!view.pointer}
        style:transform="translateY({view.pointer?.y ?? 0}px)"
      ></div>
    </div>
  </div>
  {#if cardOn}
    <ReadoutCard />
  {/if}
  {#if view.popup}
    {#key view.popup}
      {@const popup = view.popup}
      {@const onclose = () => (view.popup = null)}
      {#if popup.kind === "editor" && view.editing}
        <Popup anchor={popup.anchor} label="Edit {view.editing.curve?.mnemonic ?? 'curve'}" {onclose}>
          <CurveEditor trackId={popup.trackId} resolved={view.editing} {onclose} />
        </Popup>
      {:else if popup.kind === "picker"}
        <Popup anchor={popup.anchor} label="Add a curve" {onclose}>
          <CurvePicker trackId={popup.trackId} {onclose} />
        </Popup>
      {:else if popup.kind === "track-menu"}
        <Popup anchor={popup.anchor} label="Track menu" width="12rem" {onclose}>
          <TrackMenu trackId={popup.trackId} anchor={popup.anchor} {onclose} />
        </Popup>
      {:else if popup.kind === "fills"}
        <Popup anchor={popup.anchor} label="Fills" width="20rem" {onclose}>
          <FillEditor trackId={popup.trackId} {onclose} />
        </Popup>
      {:else if popup.kind === "add-track"}
        <Popup anchor={popup.anchor} label="Add a track" width="14rem" {onclose}>
          <AddTrackMenu {onclose} />
        </Popup>
      {/if}
    {/key}
  {/if}
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

  .bar-button {
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

  .bar-button:hover,
  .well-control[aria-expanded="true"] {
    border-color: var(--welllog-accent);
  }

  .card-toggle[aria-pressed="true"] {
    border-color: var(--welllog-accent);
    color: var(--welllog-accent);
  }

  .bar-button:focus-visible {
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
    position: relative;
    display: grid;
    grid-auto-flow: column;
    grid-template-rows: auto minmax(0, 1fr);
    width: 100%;
    min-width: min-content;
    height: 100%;
  }

  .track-header {
    position: relative;
    min-height: 1.5rem;
    background: var(--welllog-header-bg);
    border-bottom: 1px solid var(--welllog-border);
    min-width: 0;
  }

  .track-body {
    min-width: 0;
    min-height: 0;
  }

  /* A header is dragged sideways to reorder its track; its labels aren't selected on the way. */
  .track-header {
    cursor: grab;
    user-select: none;
  }

  .track-header.dragged {
    z-index: 3;
    opacity: 0.75;
    cursor: grabbing;
    box-shadow: 0 4px 12px rgb(15 23 42 / 0.25);
  }

  /*
   * ＋ (curve tracks), ⋯ and ×: shown on the track under the pointer, and
   * on focus. On touch, ＋ and ⋯ always show, and × is left to the ⋯ menu.
   */
  .track-controls {
    position: absolute;
    top: 2px;
    right: 4px;
    z-index: 1;
    display: flex;
    gap: 2px;
    opacity: 0;
    cursor: default;
  }

  .track-controls.shown,
  .track-controls:focus-within {
    opacity: 1;
  }

  .track-controls button,
  .add-track button {
    width: 1.125rem;
    height: 1.125rem;
    padding: 0;
    font: inherit;
    font-size: 0.75rem;
    line-height: 1;
    color: var(--welllog-text-muted);
    background: var(--welllog-header-bg);
    border: 1px solid var(--welllog-border);
    border-radius: 3px;
    cursor: pointer;
  }

  .track-controls button:hover,
  .add-track button:hover {
    color: var(--welllog-accent);
    border-color: var(--welllog-accent);
  }

  .track-controls .remove-track:hover {
    color: var(--welllog-cursor);
    border-color: var(--welllog-cursor);
  }

  .track-controls button:focus-visible,
  .add-track button:focus-visible {
    outline: 2px solid var(--welllog-accent);
    outline-offset: 1px;
  }

  @media (hover: none) {
    .track-controls {
      opacity: 1;
    }

    .track-controls .remove-track {
      display: none;
    }
  }

  /* On the track's right border, straddling it. */
  .border-handle {
    position: absolute;
    top: 0;
    right: -4px;
    bottom: 0;
    z-index: 2;
    width: 7px;
    cursor: col-resize;
    touch-action: none;
  }

  .border-handle:hover {
    background: linear-gradient(to right, transparent 3px, var(--welllog-accent) 3px, var(--welllog-accent) 4px, transparent 4px);
  }

  /* The ＋ after the tracks, over both rows. */
  .add-track {
    grid-row: 1 / span 2;
    display: flex;
    justify-content: center;
    padding-top: 2px;
    background: var(--welllog-header-bg);
    border-left: 1px solid var(--welllog-border);
  }

  /* The border a dragged header would land on. */
  .drop-edge {
    position: absolute;
    top: 0;
    bottom: 0;
    z-index: 4;
    width: 2px;
    margin-left: -1px;
    background: var(--welllog-accent);
    pointer-events: none;
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

  /*
   * Out of flow, so it takes no grid cell, with the track bodies' area as
   * its containing block: it spans every track (not the ＋ after them) and
   * passes under the sticky overview when they scroll sideways.
   */
  .cursor {
    position: absolute;
    grid-row: 2;
    grid-column: 2 / -2;
    top: 0;
    left: 0;
    right: 0;
    height: 1px;
    margin-top: -0.5px;
    background: var(--welllog-cursor);
    pointer-events: none;
    will-change: transform;
  }

  .cursor[hidden] {
    display: none;
  }
</style>
