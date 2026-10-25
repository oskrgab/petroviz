<script lang="ts">
	/**
	 * PROTOTYPE (#37, map #22) — throwaway. How do the log view's colours work in light and
	 * dark themes? Three colour strategies on the chosen layout (#30: A's headers and
	 * overview strip), switchable via `?variant=A|B|C`, against a real FORCE 2020 well:
	 *   A  as stored — chrome themed, template colours drawn exactly as saved;
	 *   B  adapted   — on dark, strokes lifted to a contrast floor, fills given more alpha;
	 *   C  paper     — the log sheet stays light in both themes.
	 * The colour panel (top right) shows every stored → drawn colour and the --welllog-* set.
	 * The #30 layout variants live on the `prototype/log-view` branch.
	 * URL: ?variant=B&well=35-11-11&top=…&bottom=…
	 */
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import PrototypeSwitcher from '$lib/components/PrototypeSwitcher.svelte';
	import { themeStore } from '$lib/stores/theme.svelte';
	import { LogViewState } from '$lib/welllog-prototype/view.svelte';
	import VariantA from '$lib/welllog-prototype/variants/VariantA.svelte';
	import ColourPanel from '$lib/welllog-prototype/ColourPanel.svelte';
	import type { Strategy } from '$lib/welllog-prototype/colours';

	const variants = [
		{ key: 'A', name: 'As stored' },
		{ key: 'B', name: 'Adapted on dark' },
		{ key: 'C', name: 'Paper' }
	];

	const view = new LogViewState();
	let panelOpen = $state(true);
	let variant = $state(page.url.searchParams.get('variant') ?? 'A');

	onMount(() => {
		view.init(page.url.searchParams);
	});

	$effect(() => {
		view.setStrategy((['A', 'B', 'C'].includes(variant) ? variant : 'A') as Strategy);
	});

	$effect(() => {
		void themeStore.isDark;
		void view.theme;
		view.requestDraw();
	});
</script>

<svelte:head>
	<title>Log view colours — {variant}</title>
</svelte:head>

{#if view.error}
	<div class="error">Could not load {view.well}: {view.error}</div>
{/if}

<div class="stage" style:margin-right={panelOpen ? '380px' : '0'}>
	<VariantA {view} />
</div>
<ColourPanel {view} bind:open={panelOpen} />
<PrototypeSwitcher {variants} bind:current={variant} />

<style>
	.error {
		position: fixed;
		top: 8px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 80;
		padding: 6px 10px;
		border-radius: 6px;
		background: var(--color-error-soft);
		color: var(--color-error);
		font-size: var(--font-size-sm);
	}
</style>
