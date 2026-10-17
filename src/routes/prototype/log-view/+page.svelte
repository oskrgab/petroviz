<script lang="ts">
	/**
	 * PROTOTYPE (#30, map #22) — throwaway. Three structurally different log view
	 * layouts on one route, switchable via `?variant=A|B|C`, all drawing the same real
	 * FORCE 2020 well with the same Canvas 2D renderer. Question: how should the log
	 * view look and behave (headers, depth cursor readout, track editing, overview and
	 * depth navigation), and does the renderer hold the performance bar on real data?
	 *
	 * No home in petroviz yet (well selection and navigation are fog on #22), so this
	 * is a separate route rather than a variant of the production dashboard.
	 * URL: ?variant=A&well=15-9-13&top=…&bottom=…&dpr=2
	 */
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import PrototypeSwitcher from '$lib/components/PrototypeSwitcher.svelte';
	import { themeStore } from '$lib/stores/theme.svelte';
	import { LogViewState } from '$lib/welllog-prototype/view.svelte';
	import PerfHud from '$lib/welllog-prototype/PerfHud.svelte';
	import VariantA, { name as nameA } from '$lib/welllog-prototype/variants/VariantA.svelte';
	import VariantB, { name as nameB } from '$lib/welllog-prototype/variants/VariantB.svelte';
	import VariantC, { name as nameC } from '$lib/welllog-prototype/variants/VariantC.svelte';

	const variants = [
		{ key: 'A', name: nameA },
		{ key: 'B', name: nameB },
		{ key: 'C', name: nameC }
	];

	const view = new LogViewState();
	let variant = $state(page.url.searchParams.get('variant') ?? 'A');

	onMount(() => {
		view.init(page.url.searchParams);
	});

	$effect(() => {
		void themeStore.isDark;
		view.requestDraw();
	});
</script>

<svelte:head>
	<title>Log view prototype — {variant}</title>
</svelte:head>

{#if view.error}
	<div class="error">Could not load {view.well}: {view.error}</div>
{/if}

{#key variant}
	{#if variant === 'B'}
		<VariantB {view} />
	{:else if variant === 'C'}
		<VariantC {view} />
	{:else}
		<VariantA {view} />
	{/if}
{/key}

<PerfHud {view} />
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
