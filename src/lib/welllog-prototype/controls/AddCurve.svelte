<script lang="ts">
	// PROTOTYPE (#30) — "add curve" picker: curves not shown first (with the count),
	// then every other curve of the well (e.g. to show GR twice on two scales).
	import type { LogViewState } from '../view.svelte';
	import { curveFamilyDefaults } from '../families';

	let { view, trackId, ondone }: { view: LogViewState; trackId: string; ondone?: () => void } = $props();

	const shown = $derived(view.log?.curves.filter((c) => c.kind === 'continuous' && !view.unmatched.includes(c)) ?? []);
	const hidden = $derived(view.unmatched.filter((c) => c.kind === 'continuous'));
</script>

<div class="add">
	<div class="head">{hidden.length} curve{hidden.length === 1 ? '' : 's'} not shown</div>
	{#each hidden as c (c.key)}
		<button onclick={() => (view.addCurve(trackId, c), ondone?.())}>
			<b>{c.mnemonic}</b> <span>{c.unit}</span> <i>{curveFamilyDefaults[c.family]?.label ?? c.family}</i>
		</button>
	{/each}
	<div class="head">Already shown</div>
	{#each shown as c (c.key)}
		<button onclick={() => (view.addCurve(trackId, c), ondone?.())}>
			<b>{c.mnemonic}</b> <span>{c.unit}</span> <i>{curveFamilyDefaults[c.family]?.label ?? c.family}</i>
		</button>
	{/each}
</div>

<style>
	.add {
		display: grid;
		gap: 2px;
		max-height: 320px;
		overflow: auto;
		font-size: var(--font-size-xs);
		min-width: 200px;
	}
	.head {
		margin: 6px 0 2px;
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-size: 10px;
	}
	button {
		display: flex;
		gap: 6px;
		align-items: baseline;
		text-align: left;
		font: inherit;
		border: 0;
		background: none;
		color: var(--color-text);
		padding: 3px 4px;
		border-radius: 4px;
		cursor: pointer;
	}
	button:hover {
		background: var(--color-accent-soft);
	}
	b {
		font-family: var(--font-mono);
	}
	span {
		color: var(--color-text-secondary);
	}
	i {
		margin-left: auto;
		color: var(--color-text-muted);
	}
</style>
