<script lang="ts">
	// PROTOTYPE (#30) — minimal well picker; real well selection is fog on #22.
	import type { LogViewState } from '../view.svelte';
	let { view }: { view: LogViewState } = $props();
</script>

<label class="well">
	<span>Well</span>
	<select value={view.well} onchange={(e) => view.select(e.currentTarget.value)} disabled={view.loading}>
		{#each view.wells.length ? view.wells : [view.well] as w (w)}
			<option value={w}>{w}</option>
		{/each}
	</select>
	{#if view.loading}<span class="dim">loading…</span>{/if}
	{#if view.log}<b>{view.log.name}</b>{/if}
</label>

<style>
	.well {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: var(--font-size-sm);
	}
	span {
		color: var(--color-text-secondary);
	}
	.dim {
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
	}
	select {
		font: inherit;
		font-family: var(--font-mono);
		padding: 2px 4px;
		border: 1px solid var(--color-border-strong);
		border-radius: 4px;
		background: var(--color-surface);
		color: var(--color-text);
	}
</style>
