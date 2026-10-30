<script lang="ts">
  /**
   * One track's canvas, sized for the device pixel ratio. Its one $effect
   * reads exactly what the track draws from, and asks the view for a frame
   * when any of it changes; the drawing itself happens in that frame.
   */

  import { prepareCanvas } from "./canvas.ts";
  import { drawTrack, type ResolvedTrack } from "./kinds/index.ts";
  import { getLogView } from "./logView.svelte.ts";

  let { resolved }: { resolved: ResolvedTrack } = $props();

  const view = getLogView();
  const key = {};
  let canvas: HTMLCanvasElement;
  let box = $state.raw<DOMRectReadOnly>();

  $effect(() => {
    const width = box?.width ?? 0;
    const height = box?.height ?? 0;
    const tokens = view.tokens;
    const input = {
      resolved,
      log: view.log,
      interval: view.effectiveInterval,
      depthRef: view.effectiveDepthRef,
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
      });
    });
    return () => view.cancelFrame(key);
  });
</script>

<div class="track-canvas" bind:contentRect={box}>
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
