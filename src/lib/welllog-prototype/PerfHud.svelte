<script lang="ts">
	// PROTOTYPE (#30) — performance panel, identical in every variant: live fps and draw
	// time, load timings, and a scripted zoom + pan benchmark with full redraws.
	import { replaceState } from '$app/navigation';
	import type { LogViewState, BenchResult } from './view.svelte';

	let { view }: { view: LogViewState } = $props();
	let open = $state(false);
	let running = $state(false);
	let results = $state<BenchResult[]>([]);

	async function run() {
		running = true;
		const r = await view.benchmark(240);
		results = [r, ...results];
		console.table(r);
		running = false;
	}

	function setDpr(v: string) {
		view.dprOverride = v === 'auto' ? null : Number(v);
		const url = new URL(location.href);
		if (v === 'auto') url.searchParams.delete('dpr');
		else url.searchParams.set('dpr', v);
		replaceState(url, {});
		view.requestDraw();
	}

	const t = $derived(view.timing);
	const gpu = $derived.by(() => {
		try {
			const gl = document.createElement('canvas').getContext('webgl');
			const ext = gl?.getExtension('WEBGL_debug_renderer_info');
			return ext ? String(gl!.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown';
		} catch {
			return 'unknown';
		}
	});
</script>

<div class="hud" class:open>
	<button class="pill" onclick={() => (open = !open)} title="Performance">
		<span class:bad={view.fps > 2 && view.fps < 50}>{view.fps > 2 ? `${view.fps} fps` : 'idle'}</span>
		<span class="dim">{view.lastDrawMs.toFixed(1)} ms</span>
	</button>
	{#if open}
		<div class="panel">
			<div class="row"><b>DPR</b>
				<select value={view.dprOverride === null ? 'auto' : String(view.dprOverride)} onchange={(e) => setDpr(e.currentTarget.value)}>
					<option value="auto">auto ({window.devicePixelRatio})</option>
					<option value="1">1</option>
					<option value="2">2</option>
					<option value="3">3</option>
				</select>
			</div>
			<div class="row small">GPU: {gpu}</div>
			{#if t}
				<div class="row small">
					Load {view.well}: {t.cached ? 'cache' : 'network'} {t.fetchMs.toFixed(0)} ms · decode {t.decodeMs.toFixed(0)} ms ·
					build {t.buildMs.toFixed(0)} ms · first draw {t.firstDrawMs.toFixed(0)} ms ·
					<b class:bad={t.totalMs > 1000}>total {t.totalMs.toFixed(0)} ms</b> ({(t.bytes / 1024).toFixed(0)} KB)
				</div>
			{/if}
			<button onclick={run} disabled={running}>{running ? 'Running…' : 'Run zoom/pan benchmark (240 frames)'}</button>
			{#each results as r, i (i)}
				<div class="row small" class:latest={i === 0}>
					DPR {r.dpr}: median <b class:bad={r.medianFps < 50}>{r.medianFps.toFixed(0)} fps</b> ({r.medianFrameMs.toFixed(1)} ms,
					p95 {r.p95FrameMs.toFixed(1)}) · draw JS {r.medianDrawMs.toFixed(1)} / p95 {r.p95DrawMs.toFixed(1)} ms · {r.tracks} tracks,
					{r.curves} curves
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.hud {
		position: fixed;
		right: 12px;
		bottom: 12px;
		z-index: 60;
		font-family: var(--font-mono);
		font-size: 11px;
	}
	.pill {
		display: flex;
		gap: 6px;
		margin-left: auto;
		padding: 4px 8px;
		border-radius: 999px;
		border: 1px solid #333;
		background: #111;
		color: #eee;
		cursor: pointer;
		font: inherit;
	}
	.dim {
		opacity: 0.6;
	}
	.bad {
		color: #f87171;
	}
	.panel {
		margin-top: 6px;
		width: min(420px, 90vw);
		padding: 8px 10px;
		border-radius: 8px;
		background: #111;
		color: #ddd;
		border: 1px solid #333;
		display: grid;
		gap: 6px;
	}
	.row {
		display: flex;
		gap: 6px;
		align-items: center;
		flex-wrap: wrap;
	}
	.small {
		font-size: 10.5px;
		line-height: 1.4;
		display: block;
	}
	.latest {
		color: #fff;
	}
	button:not(.pill) {
		font: inherit;
		padding: 4px 8px;
		border-radius: 4px;
		border: 1px solid #444;
		background: #222;
		color: #eee;
		cursor: pointer;
	}
	select {
		font: inherit;
		background: #222;
		color: #eee;
		border: 1px solid #444;
	}
</style>
