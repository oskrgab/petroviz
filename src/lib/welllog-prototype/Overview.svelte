<script lang="ts">
	// PROTOTYPE (#30) — overview strip: the whole well, with the visible interval as a
	// draggable window. Click to centre there, drag the window to pan.
	import { onMount } from 'svelte';
	import type { LogViewState } from './view.svelte';
	import { drawOverview, type Theme } from './render';
	import { resolveScale, entryFor } from './template';

	let {
		view,
		family = 'gr',
		zoneSet = 'GROUP',
		zoneWidth = 0.35,
		showLabels = false
	}: { view: LogViewState; family?: string; zoneSet?: string; zoneWidth?: number; showLabels?: boolean } = $props();

	let canvas: HTMLCanvasElement;
	let box: HTMLDivElement;
	let cssW = 0, cssH = 0;

	const extent = $derived(view.extent);
	const frac = (d: number) => (d - extent[0]) / (extent[1] - extent[0]);
	const winTop = $derived(Math.max(0, frac(view.top)) * 100);
	const winH = $derived(Math.max(0.6, (Math.min(1, frac(view.bottom)) - Math.max(0, frac(view.top))) * 100));
	const cursorPct = $derived(view.cursorMd === null ? null : frac(view.cursorMd) * 100);
	const zones = $derived(view.log?.zoneSets.find((s) => s.name === zoneSet)?.zones ?? []);

	function draw(theme: Theme) {
		const log = view.log;
		if (!log || !cssW || !cssH) return;
		const dpr = view.dpr;
		const w = Math.round(cssW * dpr), h = Math.round(cssH * dpr);
		if (canvas.width !== w || canvas.height !== h) {
			canvas.width = w;
			canvas.height = h;
		}
		const c = log.curves.find((c) => c.family === family) ?? log.curves.find((c) => c.kind === 'continuous');
		const e = c ? entryFor(c.family) : null;
		const [a, b] = view.extent;
		drawOverview(canvas.getContext('2d')!, log, c && e ? { c, s: resolveScale(e, c), colour: e.colour } : null, zones, { top: a, bottom: b, cssW, cssH, dpr }, theme, zoneWidth);
	}

	onMount(() => {
		const off = view.register({ draw });
		const ro = new ResizeObserver(([e]) => {
			cssW = e.contentRect.width;
			cssH = e.contentRect.height;
			view.requestDraw();
		});
		ro.observe(box);
		return () => {
			off();
			ro.disconnect();
		};
	});

	let drag: { y: number; top: number } | null = null;
	const depthAt = (clientY: number) => {
		const r = box.getBoundingClientRect();
		return extent[0] + ((clientY - r.top) / r.height) * (extent[1] - extent[0]);
	};
	function down(e: PointerEvent) {
		box.setPointerCapture(e.pointerId);
		const d = depthAt(e.clientY);
		if (d < view.top || d > view.bottom) view.centreOn(d);
		drag = { y: e.clientY, top: view.top };
	}
	function move(e: PointerEvent) {
		if (!drag) return;
		const r = box.getBoundingClientRect();
		const dd = ((e.clientY - drag.y) / r.height) * (extent[1] - extent[0]);
		const span = view.bottom - view.top;
		view.setInterval(drag.top + dd, drag.top + dd + span);
	}
	function wheel(e: WheelEvent) {
		e.preventDefault();
		view.panBy((e.deltaY / 400) * (view.bottom - view.top));
	}
</script>

<div
	class="overview"
	bind:this={box}
	onpointerdown={down}
	onpointermove={move}
	onpointerup={() => (drag = null)}
	onwheel={wheel}
	role="slider"
	aria-label="Overview of the whole well"
	aria-valuenow={Math.round(view.top)}
	tabindex="-1"
>
	<canvas bind:this={canvas}></canvas>
	{#if showLabels}
		{#each zones as z (z.name + z.top)}
			{#if (z.base - z.top) / (extent[1] - extent[0]) > 0.04}
				<span class="zlabel" style:top="{frac((z.top + z.base) / 2) * 100}%">{z.name}</span>
			{/if}
		{/each}
	{/if}
	<div class="window" style:top="{winTop}%" style:height="{winH}%"></div>
	{#if cursorPct !== null}
		<div class="cursor" style:top="{cursorPct}%"></div>
	{/if}
</div>

<style>
	.overview {
		position: relative;
		width: 100%;
		height: 100%;
		touch-action: none;
		cursor: grab;
		background: var(--color-surface);
		user-select: none;
		overflow: hidden;
	}
	canvas {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
	}
	.window {
		position: absolute;
		left: 0;
		right: 0;
		background: color-mix(in srgb, var(--color-accent) 18%, transparent);
		border: 1.5px solid var(--color-accent);
		border-radius: 2px;
		pointer-events: none;
	}
	.cursor {
		position: absolute;
		left: 0;
		right: 0;
		height: 0;
		border-top: 1px solid var(--color-error);
		pointer-events: none;
	}
	.zlabel {
		position: absolute;
		left: 2px;
		transform: translateY(-50%);
		font-size: 9px;
		line-height: 1;
		color: #111;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: calc(100% - 4px);
		pointer-events: none;
	}
</style>
