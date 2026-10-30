<script lang="ts">
	/**
	 * Well Logs Page
	 *
	 * The log view's host. It loads the FORCE 2020 well named by `?well=<file
	 * stem>` (35-11-11 when there is none) and hands the well log to the log
	 * view. The well picker in the header lists every FORCE 2020 well, read at
	 * the same time as the first well, and picking one moves the URL to it.
	 *
	 * While a well loads, the previous one stays on screen, dimmed, under a
	 * spinner, and picking another aborts the load. A failed load leaves the
	 * well on screen under a banner (Retry for a network error, Dismiss), or
	 * shows a full error state, with the picker open, when there is none.
	 *
	 * It holds the current template, the interval and the depth reference,
	 * which outlive the well log: the template starts as the default template,
	 * and the interval goes back to the whole well when another well opens.
	 *
	 * It shares the header with the production dashboard but never imports
	 * DuckDB, so a cold visit doesn't wait for it.
	 */

	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import { getConfigSummary } from '$lib/config/data-sources';
	import { themeStore } from '$lib/stores/theme.svelte';
	import { ForceLoadError, listWells, loadWell, wellName } from '$lib/sources/force2020';
	import type { WellLog } from '$lib/welllog/core';
	import { LogView, defaultTemplate, type DepthInterval, type DepthRef } from '$lib/welllog/view';
	import WellPicker from './WellPicker.svelte';
	import { sortWells, type WellList } from './wells.ts';

	const DEFAULT_WELL = '35-11-11';

	interface Failure {
		readonly id: string;
		readonly message: string;
		/** A network error may pass on a second try. */
		readonly retry: boolean;
	}

	const { dataHost, schemaHost } = getConfigSummary();
	const hosts = { dataHost, schemaHost };

	const wellId = $derived(page.url.searchParams.get('well') ?? DEFAULT_WELL);

	// Raw: templates change only by replacement (#55's operations are immutable).
	let template = $state.raw(defaultTemplate());
	let interval = $state.raw<DepthInterval | null>(null);
	let depthRef = $state<DepthRef>('md');

	// Raw: a well log is immutable and holds large typed arrays, so it is never proxied.
	let shown = $state.raw<{ id: string; log: WellLog } | null>(null);
	let loadingId = $state.raw<string | null>(null);
	let failure = $state.raw<Failure | null>(null);
	/** Bumped by Retry, to load the same well again. */
	let attempt = $state(0);

	let wells = $state.raw<WellList>({ kind: 'loading' });
	let listAttempt = $state(0);
	let pickerOpen = $state(false);

	// Started in the same flush as the first well's load, so neither waits.
	$effect(() => {
		void listAttempt;
		let current = true;
		wells = { kind: 'loading' };
		listWells(hosts).then(
			(list) => current && (wells = { kind: 'ready', wells: sortWells(list) }),
			() => current && (wells = { kind: 'error' })
		);
		return () => (current = false);
	});

	$effect(() => {
		const id = wellId;
		void attempt;
		return untrack(() => {
			failure = null;
			// Back on the well on screen: whatever was loading is dropped.
			if (shown?.id === id) {
				loadingId = null;
				return;
			}
			const controller = new AbortController();
			loadingId = id;
			loadWell(id, { signal: controller.signal, ...hosts }).then(
				(log) => {
					if (controller.signal.aborted) return;
					// A newly opened well starts whole; the template and depth reference carry over.
					interval = null;
					shown = { id, log };
					loadingId = null;
				},
				(error: unknown) => {
					if (controller.signal.aborted) return;
					loadingId = null;
					failure = {
						id,
						message: error instanceof Error ? error.message : String(error),
						retry: error instanceof ForceLoadError && error.kind === 'network'
					};
					// Nothing to look at, or no such well: offer another.
					if (!shown || (error instanceof ForceLoadError && error.kind === 'unknown-well')) pickerOpen = true;
				}
			);
			return () => controller.abort();
		});
	});

	/** The well the picker names: the one loading, else the one on screen. */
	const pickerWell = $derived.by(() => {
		const id = loadingId ?? shown?.id ?? (failure ? null : wellId);
		return id === null ? null : { id, name: wellName(id) };
	});
	const title = $derived(shown ? `${wellName(shown.id)} · Well logs` : 'Well logs · petroviz');

	function pickWell(id: string) {
		if (id === wellId) {
			// Picking the well that just failed tries it again.
			if (failure) attempt++;
			return;
		}
		const url = new URL(page.url);
		url.searchParams.set('well', id);
		goto(url, { keepFocus: true, noScroll: true });
	}

	function retry() {
		attempt++;
	}
</script>

<svelte:head>
	<title>{title}</title>
</svelte:head>

<div class="logs-page">
	<AppHeader>
		{#snippet controls()}
			<WellPicker
				list={wells}
				current={pickerWell}
				bind:open={pickerOpen}
				onpick={pickWell}
				onretry={() => listAttempt++}
			/>
		{/snippet}
	</AppHeader>
	<main class="logs-content">
		{#if shown}
			<div class="stage" class:dimmed={loadingId !== null} inert={loadingId !== null}>
				<LogView log={shown.log} bind:template bind:interval bind:depthRef scheme={themeStore.theme} />
			</div>
			{#if loadingId !== null}
				<div class="overlay">
					<LoadingSpinner message={`Loading ${wellName(loadingId)}…`} />
				</div>
			{:else if failure}
				<div class="banner" role="alert">
					<span>{failure.message}</span>
					<div class="banner-actions">
						{#if failure.retry}
							<button type="button" onclick={retry}>Retry</button>
						{/if}
						<button type="button" onclick={() => (failure = null)}>Dismiss</button>
					</div>
				</div>
			{/if}
		{:else if failure}
			<div class="state" role="alert">
				<h2>The well couldn't be opened</h2>
				<p>{failure.message}</p>
				{#if failure.retry}
					<button type="button" class="state-retry" onclick={retry}>Retry</button>
				{/if}
			</div>
		{:else}
			<div class="state">
				<LoadingSpinner message={`Loading ${wellName(loadingId ?? wellId)}…`} />
			</div>
		{/if}
	</main>
</div>

<style>
	.logs-page {
		display: flex;
		flex-direction: column;
		height: 100vh;
		max-width: 1680px;
		margin: 0 auto;
		padding: 0 var(--spacing-xl);
		overflow: hidden;
	}

	.logs-content {
		position: relative;
		flex: 1;
		min-height: 0;
		padding-bottom: var(--spacing-md);
	}

	.stage {
		height: 100%;
		transition: opacity 150ms ease;
	}

	.stage.dimmed {
		opacity: 0.4;
	}

	.overlay {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		pointer-events: none;
	}

	.banner {
		position: absolute;
		top: var(--spacing-sm);
		left: 50%;
		z-index: 10;
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
		max-width: min(40rem, calc(100% - 2 * var(--spacing-sm)));
		padding: var(--spacing-sm) var(--spacing-md);
		transform: translateX(-50%);
		font-size: var(--font-size-sm);
		color: var(--color-text);
		background: var(--color-surface-elevated);
		border: 1px solid var(--color-error);
		border-left-width: 4px;
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-lg);
	}

	.banner-actions {
		display: flex;
		gap: var(--spacing-xs);
		flex-shrink: 0;
	}

	.banner button,
	.state-retry {
		padding: 2px var(--spacing-sm);
		font: inherit;
		font-size: var(--font-size-sm);
		color: var(--color-accent);
		background: none;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		cursor: pointer;
	}

	.state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--spacing-sm);
		height: 100%;
		text-align: center;
	}

	.state h2 {
		margin: 0;
		font-size: var(--font-size-lg);
		font-weight: 600;
		color: var(--color-text);
	}

	.state p {
		margin: 0;
		max-width: 32rem;
		color: var(--color-text-secondary);
	}

	@media (max-width: 1024px) {
		.logs-page {
			padding: 0 var(--spacing-md);
		}
	}

	@media (max-width: 768px) {
		.logs-page {
			padding: 0 var(--spacing-sm);
		}
	}
</style>
