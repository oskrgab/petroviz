<script lang="ts">
  /**
   * One track's canvas, sized for the device pixel ratio. Its one $effect
   * reads exactly what the track draws from, and asks the view for a frame
   * when any of it changes; the drawing itself happens in that frame.
   *
   * The frame is the visible interval on the view's depth axis (axis.ts).
   *
   * For kinds whose items highlight under the pointer (zones), the pointer's
   * height is kept and turned into an MD against the visible interval, and
   * the kind's `hit` into an item, so scrolling under a still pointer moves
   * the highlight too. The track redraws only when that item changes.
   */

  import { prepareCanvas } from "./canvas.ts";
  import { drawTrack, hasHit, hitTrack, type ResolvedTrack } from "./kinds/index.ts";
  import { getLogView } from "./logView.svelte.ts";

  let { resolved }: { resolved: ResolvedTrack } = $props();

  const view = getLogView();
  const key = {};
  let canvas: HTMLCanvasElement;
  let box = $state.raw<DOMRectReadOnly>();
  // The pointer's height down the canvas, in CSS px, or null when it is away.
  let pointerY = $state<number | null>(null);
  // A derived compares by value, so the draw effect below reruns only when
  // the item changes, not on every pointer move.
  const hovered = $derived.by(() => {
    const height = box?.height ?? 0;
    if (pointerY === null || height <= 0) return null;
    return hitTrack(resolved, view.mdAt(pointerY / height));
  });

  const hoverable = $derived(hasHit(resolved));

  function onpointermove(event: PointerEvent) {
    pointerY = event.clientY - canvas.getBoundingClientRect().top;
  }

  $effect(() => {
    const width = box?.width ?? 0;
    const height = box?.height ?? 0;
    const tokens = view.tokens;
    const input = {
      resolved,
      log: view.log,
      axis: view.axis,
      interval: view.axisInterval,
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
        axis: input.axis,
        frame: { top, base, width: canvas.width, height: canvas.height },
        dpr,
        tokens,
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
  onpointerleave={hoverable ? () => (pointerY = null) : undefined}
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
