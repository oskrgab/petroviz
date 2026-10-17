<script lang="ts">
	// PROTOTYPE (#30) — edit one curve entry's curve scale and style. Edits go into the
	// in-memory current template; nothing persists.
	import type { LogViewState } from '../view.svelte';
	import type { MatchedEntry } from '../template';
	import { fmt } from '../template';
	import type { Dash } from '../families';

	let { view, trackId, m, onremove }: { view: LogViewState; trackId: string; m: MatchedEntry; onremove?: () => void } = $props();

	const e = $derived(m.entry);
	const fixed = $derived(e.ends.mode === 'fixed');

	function setEnds(left: number, right: number) {
		if (!Number.isFinite(left) || !Number.isFinite(right) || left === right) return;
		view.updateEntry(e, { ends: { mode: 'fixed', left, right, unit: m.curve?.unit ?? '' } });
	}
	function setMode(mode: string) {
		if (mode === 'fixed') setEnds(m.scale?.shownLeft ?? 0, m.scale?.shownRight ?? 1);
		else view.updateEntry(e, { ends: { mode: 'percentile', lo: 1, hi: 99 } });
	}
</script>

<div class="editor">
	<div class="title">
		<span class="swatch" style:border-color={e.colour} style:border-style={e.dash === 'solid' ? 'solid' : e.dash === 'dotted' ? 'dotted' : 'dashed'}></span>
		{#if m.curve}
			<b>{m.curve.mnemonic}</b> <span class="dim">{m.curve.unit} · {m.curve.family}</span>
		{:else}
			<b class="missing">{e.select.map((s) => s.value).join(' / ')}</b> <span class="dim">not in this well</span>
		{/if}
	</div>

	<div class="grid">
		<label for="mode-{e.id}">Scale</label>
		<div class="row">
			<select id="mode-{e.id}" value={fixed ? 'fixed' : 'percentile'} onchange={(ev) => setMode(ev.currentTarget.value)}>
				<option value="fixed">fixed</option>
				<option value="percentile">P1–P99 of well</option>
			</select>
			<select value={e.type} onchange={(ev) => view.updateEntry(e, { type: ev.currentTarget.value as 'linear' | 'log' })}>
				<option value="linear">linear</option>
				<option value="log">log</option>
			</select>
		</div>

		<span>Left → right</span>
		<div class="row">
			{#if fixed && e.ends.mode === 'fixed'}
				<input value={e.ends.left} onchange={(ev) => setEnds(Number(ev.currentTarget.value), (e.ends as { right: number }).right)} inputmode="decimal" aria-label="Left value" />
				<span>→</span>
				<input value={e.ends.right} onchange={(ev) => setEnds((e.ends as { left: number }).left, Number(ev.currentTarget.value))} inputmode="decimal" aria-label="Right value" />
				<button title="Reverse" onclick={() => e.ends.mode === 'fixed' && setEnds(e.ends.right, e.ends.left)}>⇄</button>
			{:else if m.scale}
				<span class="dim">{fmt(m.scale.shownLeft)} → {fmt(m.scale.shownRight)} (computed)</span>
			{/if}
		</div>

		<span>Off scale</span>
		<div class="row">
			<label><input type="radio" checked={e.offScale === 'wrap'} onchange={() => view.updateEntry(e, { offScale: 'wrap' })} /> wrap</label>
			<label><input type="radio" checked={e.offScale === 'clip'} onchange={() => view.updateEntry(e, { offScale: 'clip' })} /> clip</label>
		</div>

		<span>Style</span>
		<div class="row">
			<input type="color" value={e.colour.slice(0, 7)} oninput={(ev) => view.updateEntry(e, { colour: ev.currentTarget.value })} aria-label="Colour" />
			<select value={String(e.width)} onchange={(ev) => view.updateEntry(e, { width: Number(ev.currentTarget.value) })} aria-label="Line width">
				{#each [0.5, 1, 1.5, 2, 3] as w (w)}<option value={String(w)}>{w}px</option>{/each}
			</select>
			<select value={e.dash} onchange={(ev) => view.updateEntry(e, { dash: ev.currentTarget.value as Dash })} aria-label="Dash">
				{#each ['solid', 'dashed', 'dotted', 'dashdot'] as d (d)}<option value={d}>{d}</option>{/each}
			</select>
		</div>
	</div>

	<button class="remove" onclick={() => (view.removeCurve(trackId, e.id), onremove?.())}>Remove curve</button>
</div>

<style>
	.editor {
		display: grid;
		gap: 8px;
		font-size: var(--font-size-xs);
		color: var(--color-text);
	}
	.title {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: var(--font-size-sm);
	}
	.swatch {
		width: 18px;
		height: 0;
		border-top-width: 2px;
	}
	.dim {
		color: var(--color-text-muted);
	}
	.missing {
		color: var(--color-text-muted);
		text-decoration: line-through;
	}
	.grid {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 6px 10px;
		align-items: center;
	}
	.grid > span,
	.grid > label {
		color: var(--color-text-secondary);
	}
	.row {
		display: flex;
		gap: 4px;
		align-items: center;
		flex-wrap: wrap;
	}
	input:not([type='radio']):not([type='color']),
	select {
		font: inherit;
		font-family: var(--font-mono);
		padding: 2px 4px;
		border: 1px solid var(--color-border-strong);
		border-radius: 4px;
		background: var(--color-surface);
		color: var(--color-text);
	}
	input[inputmode] {
		width: 7ch;
	}
	input[type='color'] {
		width: 28px;
		height: 22px;
		padding: 0;
		border: 1px solid var(--color-border-strong);
		background: none;
	}
	button {
		font: inherit;
		border: 1px solid var(--color-border-strong);
		background: var(--color-surface);
		color: var(--color-text);
		border-radius: 4px;
		padding: 2px 6px;
		cursor: pointer;
	}
	.remove {
		justify-self: start;
		color: var(--color-error);
	}
</style>
