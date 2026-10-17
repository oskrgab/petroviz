<script lang="ts">
	// PROTOTYPE (#30) — one canvas per track; fills its parent box.
	import { onMount } from 'svelte';
	import type { LogViewState } from './view.svelte';
	import type { Track } from './template';
	import { drawCurveTrack, drawDepthTrack, drawDiscreteTrack, drawZoneTrack, type Theme } from './render';

	let { view, track, activeRef = 'md' }: { view: LogViewState; track: Track; activeRef?: 'md' | 'tvdss' } = $props();

	let canvas: HTMLCanvasElement;
	let cssW = 0;
	let cssH = 0;

	function draw(theme: Theme) {
		const log = view.log;
		if (!log || !cssW || !cssH) return;
		const dpr = view.dpr;
		const w = Math.round(cssW * dpr), h = Math.round(cssH * dpr);
		if (canvas.width !== w || canvas.height !== h) {
			canvas.width = w;
			canvas.height = h;
		}
		const ctx = canvas.getContext('2d')!;
		const vp = { top: view.top, bottom: view.bottom, cssW, cssH, dpr };
		const m = view.matched.get(track.id) ?? [];
		if (track.kind === 'curve') drawCurveTrack(ctx, log, m, track.fills, vp, theme);
		else if (track.kind === 'depth') drawDepthTrack(ctx, log, track.ref === 'active' ? activeRef : track.ref, vp, theme);
		else if (track.kind === 'discrete') drawDiscreteTrack(ctx, log, m[0]?.curve ?? null, vp, theme);
		else {
			const zs = log.zoneSets.find((s) => s.name === track.zoneSet)?.zones ?? [];
			drawZoneTrack(ctx, log, zs, vp, theme, view.hoveredZone);
		}
	}

	onMount(() => {
		const off = view.register({ draw });
		const ro = new ResizeObserver(([e]) => {
			cssW = e.contentRect.width;
			cssH = e.contentRect.height;
			view.requestDraw();
		});
		ro.observe(canvas.parentElement!);
		return () => {
			off();
			ro.disconnect();
		};
	});

	// redraw when the track's own settings change
	$effect(() => {
		void view.layoutVersion;
		void activeRef;
		view.requestDraw();
	});
</script>

<canvas bind:this={canvas} data-track={track.id}></canvas>

<style>
	canvas {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		display: block;
	}
</style>
