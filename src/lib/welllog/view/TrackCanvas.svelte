<script lang="ts">
  /**
   * One track's canvas, sized for the device pixel ratio. Its one $effect
   * reads exactly what the track draws from, and asks the view for a frame
   * when any of it changes; the drawing itself happens in that frame.
   *
   * For kinds whose items highlight under the pointer (zones), the pointer
   * is turned into an MD and the kind's `hit` into an item; the track
   * redraws only when that item changes.
   */

  import { prepareCanvas } from "./canvas.ts";
  import { drawTrack, hasHit, hitTrack, type ResolvedTrack } from "./kinds/index.ts";
  import { getLogView } from "./logView.svelte.ts";

  let { resolved }: { resolved: ResolvedTrack } = $props();

  const view = getLogView();
  const key = {};
  let canvas: HTMLCanvasElement;
  let box = $state.raw<DOMRectReadOnly>();
  // Kept with the resolved track it was found in, so a new well or template
  // never outlines an item by a stale index.
  let hover = $state.raw<{ resolved: ResolvedTrack; item: number | null } | null>(null);
  const hovered = $derived(hover?.resolved === resolved ? hover.item : null);

  const hoverable = $derived(hasHit(resolved));

  function onpointermove(event: PointerEvent) {
    const height = box?.height ?? 0;
    if (height <= 0) return;
    const { top, base } = view.effectiveInterval;
    const y = event.clientY - canvas.getBoundingClientRect().top;
    const item = hitTrack(resolved, top + (y / height) * (base - top));
    if (item !== hovered) hover = { resolved, item };
  }

  $effect(() => {
    const width = box?.width ?? 0;
    const height = box?.height ?? 0;
    const tokens = view.tokens;
    const input = {
      resolved,
      log: view.log,
      interval: view.effectiveInterval,
      depthRef: view.effectiveDepthRef,
      hovered,
    };
    if (width <= 0 || height <= 0 || !tokens) return;

    view.requestFrame(key, () => {
      const dpr = window.devicePixelRatio || 1;
      const ctx = prepareCanvas(canvas, width, height, dpr);
      if (!ctx) return;
      const { top, base } = input.interval;
      drawTrack(ctx, input.resolved, {
        log: input.log,
        frame: { top, base, width: canvas.width, height: canvas.height },
        dpr,
        tokens,
        depthRef: input.depthRef,
        hovered: input.hovered,
      });
    });
    return () => view.cancelFrame(key);
  });
</script>

<div
  class="track-canvas"
  bind:contentRect={box}
  onpointermove={hoverable ? onpointermove : undefined}
  onpointerleave={hoverable ? () => (hover = null) : undefined}
>
  <canvas bind:this={canvas}></canvas>
</div>

<style>
  .track-canvas {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }

  canvas {
    position: absolute;
    inset: 0;
    display: block;
    width: 100%;
    height: 100%;
  }
</style>
