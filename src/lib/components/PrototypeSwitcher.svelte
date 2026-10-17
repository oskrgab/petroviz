<script lang="ts">
	/**
	 * PrototypeSwitcher — PROTOTYPE tooling, never shipped.
	 *
	 * Floating bottom bar that cycles UI prototype variants through the `?variant=`
	 * search param. Arrow keys cycle too, except while typing in a field.
	 */
	import { dev } from '$app/environment';
	import { replaceState } from '$app/navigation';

	let {
		variants,
		current = $bindable()
	}: { variants: { key: string; name: string }[]; current: string } = $props();

	const index = $derived(Math.max(0, variants.findIndex((v) => v.key === current)));

	function go(step: number) {
		const next = variants[(index + step + variants.length) % variants.length];
		current = next.key;
		const url = new URL(location.href);
		url.searchParams.set('variant', next.key);
		replaceState(url, {});
	}

	function onKey(e: KeyboardEvent) {
		const el = e.target as HTMLElement;
		if (el.closest?.('input, textarea, select, [contenteditable]')) return;
		if (e.key === 'ArrowLeft') go(-1);
		if (e.key === 'ArrowRight') go(1);
	}
</script>

<svelte:window onkeydown={onKey} />

{#if dev}
	<div class="switcher" role="toolbar" aria-label="Prototype variant">
		<button onclick={() => go(-1)} aria-label="Previous variant">←</button>
		<span><b>{variants[index].key}</b> ({variants[index].name})</span>
		<button onclick={() => go(1)} aria-label="Next variant">→</button>
	</div>
{/if}

<style>
	.switcher {
		position: fixed;
		left: 50%;
		bottom: 14px;
		transform: translateX(-50%);
		z-index: 70;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 5px 8px;
		border-radius: 999px;
		background: #ff3d7f;
		color: #fff;
		font: 600 12px/1 var(--font-mono);
		box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
	}
	button {
		border: 0;
		border-radius: 999px;
		width: 26px;
		height: 26px;
		background: rgba(255, 255, 255, 0.2);
		color: inherit;
		font: inherit;
		cursor: pointer;
	}
	button:hover {
		background: rgba(255, 255, 255, 0.35);
	}
</style>
