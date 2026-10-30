<script lang="ts">
	/**
	 * Well Logs Page
	 *
	 * The log view's host. The URL names the well, the depth reference and
	 * the MD interval (link.ts, ADR-0005): `?well=<file stem>&ref=tvdss&md=
	 * <top>-<base>`. A link naming no well opens 35-11-11 and says so in the
	 * URL. The well picker in the header lists every FORCE 2020 well, read at
	 * the same time as the first well; picking one adds a history entry.
	 * Interval and depth reference changes replace the current entry once
	 * they settle, so Back steps through the wells opened, and restores each
	 * one's interval and depth reference.
	 *
	 * While a well loads, the previous one stays on screen, dimmed, under a
	 * spinner, and picking another aborts the load. A failed load leaves the
	 * well on screen under a banner (Retry for a network error, Dismiss), and
	 * puts it back in the URL. With no well on screen it shows a full error
	 * state instead, with the picker open, and leaves the URL as it was. An
	 * unknown well opens the picker too. A link that names a LAS file says it
	 * can't be opened here.
	 *
	 * It holds the current template, the interval and the depth reference,
	 * which outlive the well log: the template starts as the default template,
	 * and the interval goes back to the link's (the whole well when it names
	 * none) when another well opens.
	 *
	 * It shares the header with the production dashboard but never imports
	 * DuckDB, so a cold visit doesn't wait for it.
	 */

	import { untrack } from 'svelte';
	import { afterNavigate, goto } from '$app/navigation';
	import { page } from '$app/state';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import { getConfigSummary } from '$lib/config/data-sources';
	import { themeStore } from '$lib/stores/theme.svelte';
	import { ForceLoadError, listWells, loadWell, unknownWellError, wellName } from '$lib/sources/force2020';
	import type { WellLog } from '$lib/welllog/core';
	import { LogView, defaultTemplate, type DepthInterval, type DepthRef } from '$lib/welllog/view';
	import WellPicker from './WellPicker.svelte';
	import { DEFAULT_WELL, parseLink, writeLink, type LogLink } from './link.ts';
	import { isUnlisted, sortWells, type WellList } from './wells.ts';

	/** Interval and depth reference changes reach the URL this long after the last one. */
	const URL_DELAY_MS = 250;

	interface Failure {
		/** The well, or the LAS file, that didn't open. */
		readonly id: string;
		readonly message: string;
		/** A network error may pass on a second try. */
		readonly retry: boolean;
	}

	const { dataHost, schemaHost } = getConfigSummary();
	const hosts = { dataHost, schemaHost };

	const link = $derived(parseLink(page.url.searchParams));
	/**
	 * The FORCE 2020 well the URL names, or null for a LAS file. A name that
	 * fails the well id check is kept, and loadWell refuses it unfetched.
	 */
	const wellId = $derived.by(() => {
		const { source } = link;
		if (source.kind === 'none') return DEFAULT_WELL;
		if (source.kind === 'las') return null;
		return source.kind === 'well' ? source.id : source.name;
	});

	// Raw: templates change only by replacement (#55's operations are immutable).
	let template = $state.raw(defaultTemplate());
	let interval = $state.raw<DepthInterval | null>(null);
	let depthRef = $state<DepthRef>(untrack(() => link.ref));

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
			// Back on the well on screen: whatever was loading is dropped, and so
			// is a message about another link, unless a failure sent the URL here.
			if (shown && shown.id === id) {
				loadingId = null;
				if (!reverting) failure = null;
				reverting = false;
				return;
			}
			reverting = false;
			// A LAS file can't be fetched: it was opened from someone's disk.
			if (id === null) {
				const fileName = link.source.kind === 'las' ? link.source.fileName : '';
				loadingId = null;
				failure = {
					id: fileName,
					message: `This link names ${fileName}, a LAS file opened from disk, which this page can't open yet. Choose a FORCE 2020 well above.`,
					retry: false
				};
				return;
			}
			failure = null;
			if (isUnlisted(wells, id)) {
				fail(id, unknownWellError(id));
				return;
			}
			const controller = new AbortController();
			loadingId = id;
			loadWell(id, { signal: controller.signal, ...hosts }).then(
				(log) => {
					if (controller.signal.aborted) return;
					// A newly opened well starts at the link's interval; the template and depth reference carry over.
					interval = link.interval;
					shown = { id, log };
					loadingId = null;
				},
				(error: unknown) => {
					if (!controller.signal.aborted) fail(id, error);
				}
			);
			return () => controller.abort();
		});
	});

	/** Set while a failed load sends the URL back to the well on screen, so its banner stays. */
	let reverting = false;
	/** The well a pick just added a history entry for, until another navigation. */
	let pushed: string | null = null;

	function fail(id: string, error: unknown) {
		const unknown = error instanceof ForceLoadError && error.kind === 'unknown-well';
		loadingId = null;
		failure = {
			id,
			message: error instanceof Error ? error.message : String(error),
			retry: error instanceof ForceLoadError && error.kind === 'network'
		};
		// Nothing to look at, or no such well: offer another.
		if (!shown || unknown) pickerOpen = true;
		// The URL follows the well on screen. With none, the link stays as it was.
		if (!shown) return;
		reverting = true;
		// A pick's own entry is stepped back over, so history doesn't name the well on screen twice.
		if (pushed === id) history.back();
		else writeUrl(linkTo(shown.id, interval), 'replace');
		pushed = null;
	}

	/** The link to a FORCE 2020 well at `at`, in the depth reference shown. */
	function linkTo(id: string, at: DepthInterval | null): LogLink {
		return { source: { kind: 'well', id }, ref: depthRef, interval: at };
	}

	let urlTimer: ReturnType<typeof setTimeout> | undefined;

	/** Put `next` in the URL, unless it is there already. */
	function writeUrl(next: LogLink, entry: 'push' | 'replace'): Promise<void> | undefined {
		clearTimeout(urlTimer);
		urlTimer = undefined;
		const url = new URL(page.url);
		url.search = writeLink(next).toString();
		if (url.href === page.url.href) return;
		return goto(url, { replaceState: entry === 'replace', keepFocus: true, noScroll: true });
	}

	/** The interval and depth reference of the well on screen, into its own entry. */
	function writeSettled(): Promise<void> | undefined {
		// The URL already names another well: its entry isn't this well's to change.
		if (!shown || loadingId !== null || wellId !== shown.id) return;
		return writeUrl(linkTo(shown.id, interval), 'replace');
	}

	/** Write the interval and depth reference once they settle. */
	function settleUrl() {
		clearTimeout(urlTimer);
		urlTimer = setTimeout(writeSettled, URL_DELAY_MS);
	}

	afterNavigate(({ type }) => {
		if (type === 'popstate') pushed = null;
		// No well named, on arrival or by a plain /logs link: name the one that opens.
		if (link.source.kind === 'none') {
			writeUrl(shown?.id === DEFAULT_WELL ? linkTo(DEFAULT_WELL, interval) : linkTo(DEFAULT_WELL, link.interval), 'replace');
		} else if (type === 'popstate') {
			clearTimeout(urlTimer);
			urlTimer = undefined;
			depthRef = link.ref;
			// Another well takes the link's interval once it loads.
			if (shown && shown.id === wellId) interval = link.interval;
		}
	});

	/** The well the picker names: the one loading, else the one on screen. */
	const pickerWell = $derived.by(() => {
		const id = loadingId ?? shown?.id ?? (failure ? null : wellId);
		return id === null ? null : { id, name: wellName(id) };
	});
	const title = $derived(shown ? `${wellName(shown.id)} · Well logs` : 'Well logs · petroviz');

	async function openWell(id: string) {
		// A change still settling belongs to the entry being left.
		if (urlTimer !== undefined) await writeSettled();
		pushed = id;
		writeUrl(linkTo(id, null), 'push');
	}

	function pickWell(id: string) {
		if (id !== wellId) openWell(id);
		// Picking the well that just failed tries it again.
		else if (failure?.id === id) attempt++;
	}

	function retry() {
		if (!failure) return;
		// The URL went back to the well on screen, so the failed one is opened again.
		if (failure.id === wellId) attempt++;
		else openWell(failure.id);
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
				<LogView
					log={shown.log}
					bind:template
					bind:interval={() => interval, (next) => ((interval = next), settleUrl())}
					bind:depthRef={() => depthRef, (next) => ((depthRef = next), settleUrl())}
					scheme={themeStore.theme}
				/>
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
				<LoadingSpinner message={loadingId ? `Loading ${wellName(loadingId)}…` : 'Loading…'} />
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
