<script lang="ts">
  /**
   * The overview strip: the whole well as one curve (the first gamma-ray
   * curve, else the first continuous one) beside the colours of the first
   * zone set, with the visible interval as a window. A click centres the
   * view there, dragging pans (a press outside the window centres first, then
   * drags on from there), and the wheel and keys scroll.
   *
   * The curve takes its family's default scale and colour; the zones take
   * their zone track's colours when the template shows that set, so the two
   * agree. The curve colour is adapted on a dark track, as a curve track's
   * is. Drawn through the view's frame scheduler, like the tracks.
   */

  import { prepareCanvas, strokePolyline } from "./canvas.ts";
  import { zoneColours } from "./colour/categorical.ts";
  import { scaleSource } from "./geometry/log10.ts";
  import { curvePolyline } from "./geometry/polyline.ts";
  import { mappingOf } from "./geometry/scale.ts";
  import type { DepthInterval } from "./interval.ts";
  import { getLogView } from "./logView.svelte.ts";
  import { centreOn, keyStep, overviewCurve, panByPixels, wheelPixels } from "./navigation.ts";
  import { resolveScale } from "./scaleEnds.ts";
  import { curveFamilyDefaults, type ContinuousFamily } from "./template/defaults.ts";

  /** The share of the strip's width the zone colours take, on its left. */
  const ZONE_SHARE = 0.4;
  /** The window never draws thinner than this, so a 20 m view still shows on a deep well. */
  const MIN_WINDOW_PX = 3;

  const view = getLogView();
  const key = {};
  let canvas: HTMLCanvasElement;
  let box = $state.raw<DOMRectReadOnly>();

  const curve = $derived(overviewCurve(view.log));
  const zoneSet = $derived(view.log.zoneSets[0] ?? null);
  const zoneFills = $derived.by(() => {
    if (!zoneSet) return [];
    const shown = view.resolved.tracks.find((t) => t.kind === "zone" && t.zoneSet?.name === zoneSet.name);
    return shown?.kind === "zone" ? shown.colours : zoneColours(zoneSet.zones);
  });
  const line = $derived.by(() => {
    if (!curve) return null;
    // A LAS lithology column read as continuous has no curve default.
    const defaults = curveFamilyDefaults[curve.family as ContinuousFamily] ?? curveFamilyDefaults.unknown;
    const scale = resolveScale(defaults.scale, curve);
    return { source: scaleSource(curve.values, scale.type), mapping: mappingOf(scale), colour: defaults.style.colour };
  });

  $effect(() => {
    const width = box?.width ?? 0;
    const height = box?.height ?? 0;
    const { log, whole } = view;
    const zones = zoneSet?.zones ?? [];
    const fills = zoneFills;
    const drawn = line;
    const colour = drawn && view.strokeColour(drawn.colour);
    if (width <= 0 || height <= 0) return;

    view.requestFrame(key, () => {
      const dpr = window.devicePixelRatio || 1;
      const ctx = prepareCanvas(canvas, width, height, dpr);
      if (!ctx) return;
      const k = canvas.height / (whole.base - whole.top);
      const zoneWidth = Math.round(canvas.width * ZONE_SHARE);
      zones.forEach((zone, i) => {
        const y0 = Math.round((zone.top - whole.top) * k);
        const y1 = Math.max(Math.round((zone.base - whole.top) * k), y0 + 1);
        ctx.fillStyle = fills[i];
        ctx.fillRect(0, y0, zoneWidth, y1 - y0);
      });
      if (!drawn || !colour) return;
      const frame = { top: whole.top, base: whole.base, width: canvas.width - zoneWidth, height: canvas.height };
      ctx.save();
      ctx.translate(zoneWidth, 0);
      ctx.beginPath();
      ctx.rect(0, 0, frame.width, frame.height);
      ctx.clip();
      ctx.strokeStyle = colour;
      ctx.lineWidth = dpr;
      ctx.lineJoin = "round";
      strokePolyline(ctx, curvePolyline(log.md, drawn.source, drawn.mapping, frame, dpr / 2));
      ctx.restore();
    });
    return () => view.cancelFrame(key);
  });

  const windowStyle = $derived.by(() => {
    const { whole, effectiveInterval: shown } = view;
    const span = whole.base - whole.top;
    const top = ((shown.top - whole.top) / span) * 100;
    const height = ((shown.base - shown.top) / span) * 100;
    return { top: `${top}%`, height: `max(${height}%, ${MIN_WINDOW_PX}px)` };
  });

  /** A press under way: where it began, the view then, and whether it has moved. */
  let drag: { y: number; at: DepthInterval; moved: boolean } | null = null;

  /** A press that moves less than this many CSS px is a click. */
  const CLICK_SLOP_PX = 4;

  const depthAt = (clientY: number) => {
    const rect = canvas.getBoundingClientRect();
    const { whole } = view;
    return whole.top + ((clientY - rect.top) / rect.height) * (whole.base - whole.top);
  };

  function onpointerdown(event: PointerEvent) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    const depth = depthAt(event.clientY);
    const shown = view.effectiveInterval;
    if (depth < shown.top || depth > shown.base) view.navigate(centreOn(shown, depth, view.whole));
    drag = { y: event.clientY, at: view.effectiveInterval, moved: false };
  }

  function onpointermove(event: PointerEvent) {
    if (!drag) return;
    if (!drag.moved && Math.abs(event.clientY - drag.y) <= CLICK_SLOP_PX) return;
    drag.moved = true;
    const height = canvas.getBoundingClientRect().height;
    const { whole } = view;
    view.navigate(panByPixels(drag.at, event.clientY - drag.y, height, whole, whole.base - whole.top));
  }

  function onpointerup(event: PointerEvent) {
    if (drag && !drag.moved) view.navigate(centreOn(view.effectiveInterval, depthAt(event.clientY), view.whole));
    drag = null;
  }

  function onwheel(event: WheelEvent) {
    event.preventDefault();
    const height = canvas.getBoundingClientRect().height;
    const pixels = wheelPixels(event.deltaY, event.deltaMode, height);
    view.navigate(panByPixels(view.effectiveInterval, pixels, height, view.whole));
  }

  function onkeydown(event: KeyboardEvent) {
    const next = keyStep(view.effectiveInterval, event.key, view.whole);
    if (!next) return;
    event.preventDefault();
    view.navigate(next);
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="overview"
  role="slider"
  tabindex="0"
  aria-label="Visible interval in the whole well"
  aria-orientation="vertical"
  aria-valuemin={Math.round(view.whole.top)}
  aria-valuemax={Math.round(view.whole.base)}
  aria-valuenow={Math.round(view.effectiveInterval.top)}
  aria-valuetext={`${view.effectiveInterval.top.toFixed(1)}–${view.effectiveInterval.base.toFixed(1)} ${view.log.depthUnit} MD`}
  bind:contentRect={box}
  {onpointerdown}
  {onpointermove}
  {onpointerup}
  onpointercancel={() => (drag = null)}
  {onwheel}
  {onkeydown}
>
  <canvas bind:this={canvas}></canvas>
  <div class="window" style:top={windowStyle.top} style:height={windowStyle.height}></div>
</div>

<style>
  .overview {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    cursor: grab;
    touch-action: none;
    user-select: none;
  }

  .overview:active {
    cursor: grabbing;
  }

  .overview:focus-visible {
    outline: 2px solid var(--welllog-accent);
    outline-offset: -2px;
  }

  canvas {
    position: absolute;
    inset: 0;
    display: block;
    width: 100%;
    height: 100%;
  }

  .window {
    position: absolute;
    left: 0;
    right: 0;
    box-sizing: border-box;
    background: color-mix(in srgb, var(--welllog-window) 18%, transparent);
    border: 1.5px solid var(--welllog-window);
    border-radius: 2px;
    pointer-events: none;
  }
</style>
