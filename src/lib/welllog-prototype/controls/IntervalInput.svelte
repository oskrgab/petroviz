<script lang="ts">
	// PROTOTYPE (#30) — exact depth interval input; applies on Enter or blur.
	import type { LogViewState } from '../view.svelte';
	let { view, compact = false }: { view: LogViewState; compact?: boolean } = $props();

	let top = $state('');
	let bottom = $state('');
	let editing = $state(false);
	$effect(() => {
		if (!editing) {
			top = view.top.toFixed(1);
			bottom = view.bottom.toFixed(1);
		}
	});
	function apply() {
		editing = false;
		const a = Number(top), b = Number(bottom);
		if (Number.isFinite(a) && Number.isFinite(b) && b > a) view.setInterval(a, b);
	}
	const key = (e: KeyboardEvent) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur();
</script>

<div class="interval" class:compact>
	{#if !compact}<span>MD</span>{/if}
	<input bind:value={top} onfocus={() => (editing = true)} onblur={apply} onkeydown={key} inputmode="decimal" aria-label="Top depth" />
	<span>–</span>
	<input bind:value={bottom} onfocus={() => (editing = true)} onblur={apply} onkeydown={key} inputmode="decimal" aria-label="Bottom depth" />
	<span>m</span>
	<button onclick={() => view.showWhole()} title="Whole well">⤢</button>
</div>

<style>
	.interval {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-family: var(--font-mono);
		font-size: var(--font-size-xs);
		color: var(--color-text-secondary);
	}
	input {
		width: 7.5ch;
		font: inherit;
		padding: 2px 4px;
		border: 1px solid var(--color-border-strong);
		border-radius: 4px;
		background: var(--color-surface);
		color: var(--color-text);
		text-align: right;
	}
	.compact input {
		width: 6.5ch;
	}
	button {
		font: inherit;
		border: 1px solid var(--color-border-strong);
		background: var(--color-surface);
		color: var(--color-text);
		border-radius: 4px;
		padding: 1px 6px;
		cursor: pointer;
	}
</style>
