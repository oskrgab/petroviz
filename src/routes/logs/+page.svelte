<script lang="ts">
	/**
	 * Well Logs Page
	 *
	 * The log view's host. The URL names the well, the depth reference and
	 * the MD interval (link.ts, ADR-0005): `?well=<file stem>&ref=tvdss&md=
	 * <top>-<base>`, or `?las=<file name>&…` for a LAS file opened from disk.
	 * A link naming neither opens 35-11-11 and says so in the URL. The well
	 * picker in the header lists every FORCE 2020 well, read at the same time
	 * as the first well; picking one adds a history entry, and so does
	 * opening a file. Interval and depth reference changes replace the
	 * current entry once they settle, so Back steps through the wells
	 * opened, and restores each one's interval and depth reference.
	 *
	 * A LAS file is opened with Open LAS file in the header, or dropped
	 * anywhere on the page, and read in a worker (readLas). The most recent
	 * LAS well log stays in memory, so Back or Forward to its entry restores
	 * it; a link to any other file asks for it to be opened again, and once
	 * it is, takes the link's interval.
	 *
	 * While a well loads, the previous one stays on screen, dimmed, under a
	 * spinner, and picking another well or opening a file aborts the load. A
	 * failed load leaves the well on screen under a banner (Retry for a
	 * network error, Dismiss), and puts it back in the URL. With no well on
	 * screen it shows a full error state instead, with the picker open, and
	 * leaves the URL as it was. An unknown well opens the picker too. A file
	 * that can't be read only shows its message: it never reached the URL.
	 *
	 * It holds the current template, the interval and the depth reference,
	 * which outlive the well log: the template starts as the default template,
	 * and the interval goes back to the link's (the whole well when it names
	 * none) when another well opens.
	 *
	 * It shares the header with the production dashboard but never imports
	 * DuckDB, so a cold visit doesn't wait for it.
	 */

	import { onDestroy, untrack } from 'svelte';
	import { afterNavigate, goto } from '$app/navigation';
	import { page } from '$app/state';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import { getConfigSummary } from '$lib/config/data-sources';
	import { themeStore } from '$lib/stores/theme.svelte';
	import { ForceLoadError, listWells, loadWell, unknownWellError, wellName } from '$lib/sources/force2020';
	import type { WellLog } from '$lib/welllog/core';
	import { readLas } from '$lib/welllog/las';
	import { LogView, defaultTemplate, type DepthInterval, type DepthRef } from '$lib/welllog/view';
	import OpenLasButton from './OpenLasButton.svelte';
	import WellPicker from './WellPicker.svelte';
	import { DEFAULT_WELL, parseLink, sourceKey, writeLink, type LinkSource, type LogLink } from './link.ts';
	import { entryName, isUnlisted, lasEntry, skippedNote, sortWells, type PickerCurrent, type WellList } from './wells.ts';

	/** Interval and depth reference changes reach the URL this long after the last one. */
	const URL_DELAY_MS = 250;
	/** How long the note about skipped files stays. */
	const NOTE_MS = 8000;

	interface Failure {
		/** The well, or the LAS file, that didn't open. */
		readonly id: string;
		/** `ask`: a link to a LAS file that isn't in memory, so opening the file again shows it. */
		readonly kind: 'well' | 'file' | 'ask';
		readonly message: string;
		/** A network error may pass on a second try. */
		readonly retry: boolean;
	}

	/** Where a well log on screen came from. */
	type ShownSource = Extract<LinkSource, { kind: 'well' | 'las' }>;

	/** A well or file on its way: what the URL compares it by, and what the picker calls it. */
	interface Loading {
		/** sourceKey of its source, to compare with the URL's. */
		readonly key: string;
		readonly entry: PickerCurrent;
	}

	interface Shown extends Loading {
		readonly source: ShownSource;
		readonly log: WellLog;
	}

	const { dataHost, schemaHost } = getConfigSummary();
	const hosts = { dataHost, schemaHost };

	const link = $derived(parseLink(page.url.searchParams));
	/** What the URL names, as a string, so only a change of well or file reruns the load. */
	const key = $derived(sourceKey(link.source));
	/**
	 * The FORCE 2020 well the URL names, or null for a LAS file. A name that
	 * fails the well id check is kept, and loadWell refuses it unfetched.
	 */
	const wellId = $derived(wellIdOf(link.source));

	function wellIdOf(source: LinkSource): string | null {
		if (source.kind === 'none') return DEFAULT_WELL;
		if (source.kind === 'las') return null;
		return source.kind === 'well' ? source.id : source.name;
	}

	// Raw: templates change only by replacement (#55's operations are immutable).
	let template = $state.raw(defaultTemplate());
	let interval = $state.raw<DepthInterval | null>(null);
	let depthRef = $state<DepthRef>(untrack(() => link.ref));

	// Raw: a well log is immutable and holds large typed arrays, so it is never proxied.
	let shown = $state.raw<Shown | null>(null);
	let loading = $state.raw<Loading | null>(null);
	let failure = $state.raw<Failure | null>(null);
	/** Bumped by Retry, to load the same well again. */
	let attempt = $state(0);
	/** The most recent LAS well log, so Back or Forward to its entry restores it. */
	let lasMemory: { readonly fileName: string; readonly log: WellLog } | null = null;
	/** The load in progress, a well's or a file's: one at a time. */
	let controller: AbortController | null = null;

	let wells = $state.raw<WellList>({ kind: 'loading' });
	let listAttempt = $state(0);
	let pickerOpen = $state(false);
	let opener = $state<OpenLasButton>();

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
		const current = key;
		void attempt;
		untrack(() => openLinked(current));
	});

	onDestroy(() => controller?.abort());

	/** Abort whatever is loading, and show `next` as loading instead. */
	function startLoad(next: Loading): AbortSignal {
		controller?.abort();
		controller = new AbortController();
		loading = next;
		return controller.signal;
	}

	/** The load in progress is over: done or failed. */
	function endLoad() {
		controller = null;
		loading = null;
	}

	/** Abort the load in progress, if any. */
	function cancelLoad() {
		controller?.abort();
		endLoad();
	}

	/** Bring what the URL names, `current`, on screen. */
	function openLinked(current: string) {
		// Back on the well on screen: whatever was loading is dropped, and so
		// is a message about another link, unless a failure sent the URL here.
		if (shown && shown.key === current) {
			cancelLoad();
			if (!reverting) failure = null;
			reverting = false;
			return;
		}
		reverting = false;
		const { source } = link;
		if (source.kind === 'las') {
			cancelLoad();
			if (lasMemory?.fileName === source.fileName) {
				failure = null;
				interval = link.interval;
				shown = { source, key: current, log: lasMemory.log, entry: lasEntry(lasMemory.log, source.fileName) };
				return;
			}
			// A reload or a shared link: only the reader's disk has the file.
			failure = {
				id: source.fileName,
				kind: 'ask',
				message: `This link names ${source.fileName}, a LAS file opened from disk. Open it again, or drop it here, to see it.`,
				retry: false
			};
			return;
		}
		const id = wellIdOf(source) ?? DEFAULT_WELL;
		failure = null;
		if (isUnlisted(wells, id)) {
			cancelLoad();
			fail(id, unknownWellError(id));
			return;
		}
		const entry = { id, name: wellName(id) };
		const signal = startLoad({ key: current, entry });
		loadWell(id, { signal, ...hosts }).then(
			(log) => {
				if (signal.aborted) return;
				endLoad();
				// A newly opened well starts at the link's interval; the template and depth reference carry over.
				interval = link.interval;
				shown = { source: { kind: 'well', id }, key: current, log, entry };
			},
			(error: unknown) => {
				if (!signal.aborted) fail(id, error);
			}
		);
	}

	/** Set while a failed load sends the URL back to the well on screen, so its banner stays. */
	let reverting = false;
	/** The well a pick just added a history entry for, until another navigation. */
	let pushed: string | null = null;
	/** A file on screen whose history entry isn't pushed yet (openFile waits a frame to push it). */
	let unpushed: Shown | null = null;

	function fail(id: string, error: unknown) {
		const unknown = error instanceof ForceLoadError && error.kind === 'unknown-well';
		endLoad();
		failure = {
			id,
			kind: 'well',
			message: messageOf(error),
			retry: error instanceof ForceLoadError && error.kind === 'network'
		};
		// Nothing to look at, or no such well: offer another.
		if (!shown || unknown) pickerOpen = true;
		urlBackToShown();
	}

	function messageOf(error: unknown): string {
		return error instanceof Error ? error.message : String(error);
	}

	/**
	 * After a failure, the URL follows the well on screen again, keeping the
	 * failure's banner. With none, the link stays as it was.
	 */
	function urlBackToShown() {
		if (!shown || key === shown.key) return;
		reverting = true;
		// A pick's own entry is stepped back over, so history doesn't name the well on screen twice.
		if (pushed !== null && key === sourceKey({ kind: 'well', id: pushed })) history.back();
		// A file never pushed takes an entry of its own: the URL's names what was on screen before it.
		else writeUrl(linkTo(shown.source, interval), shown === unpushed ? 'push' : 'replace');
		pushed = null;
		unpushed = null;
	}

	/** The link to `source` at `at`, in the depth reference shown. */
	function linkTo(source: LinkSource, at: DepthInterval | null): LogLink {
		return { source, ref: depthRef, interval: at };
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
		if (!shown || loading !== null || key !== shown.key) return;
		return writeUrl(linkTo(shown.source, interval), 'replace');
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
			const source = { kind: 'well', id: DEFAULT_WELL } as const;
			writeUrl(shown?.key === key ? linkTo(source, interval) : linkTo(source, link.interval), 'replace');
		} else if (type === 'popstate') {
			clearTimeout(urlTimer);
			urlTimer = undefined;
			depthRef = link.ref;
			// Another well takes the link's interval once it loads.
			if (shown && shown.key === key) interval = link.interval;
		}
	});

	const failureHeadings: Record<Failure['kind'], (id: string) => string> = {
		well: () => "The well couldn't be opened",
		file: (id) => `${id} couldn't be opened`,
		ask: (id) => `Open ${id} again`
	};

	/** The well the picker names: the one loading, else the one on screen. */
	const pickerWell = $derived.by((): PickerCurrent | null => {
		if (loading) return loading.entry;
		if (shown) return shown.entry;
		return failure || wellId === null ? null : { id: wellId, name: wellName(wellId) };
	});
	const title = $derived(shown ? `${entryName(shown.entry)} · Well logs` : 'Well logs · petroviz');

	async function openWell(id: string) {
		// A change still settling belongs to the entry being left.
		if (urlTimer !== undefined) await writeSettled();
		pushed = id;
		writeUrl(linkTo({ kind: 'well', id }, null), 'push');
	}

	function pickWell(id: string) {
		if (id !== wellId) openWell(id);
		// The well on screen, picked while a file is read: stay on it.
		else if (shown?.key === key) cancelLoad();
		// Picking the well the URL names, when it isn't on screen or on its way, tries it again.
		else if (loading?.key !== key) attempt++;
	}

	function retry() {
		if (!failure) return;
		// The URL went back to the well on screen, so the failed one is opened again.
		if (failure.id === wellId) attempt++;
		else openWell(failure.id);
	}

	/** Read `file` as LAS and show it, in a new history entry unless a link asked for it. */
	async function openFile(file: File) {
		// A change still settling belongs to the entry being left.
		if (urlTimer !== undefined) await writeSettled();
		const source = { kind: 'las', fileName: file.name } as const;
		const fileKey = sourceKey(source);
		failure = null;
		const signal = startLoad({ key: fileKey, entry: { fileName: file.name, name: null } });
		let log: WellLog;
		try {
			log = await readLas(file, { signal });
		} catch (error) {
			if (signal.aborted) return;
			endLoad();
			failure = { id: file.name, kind: 'file', message: messageOf(error), retry: false };
			if (!shown) pickerOpen = true;
			// A well the read cut short, or a link asking for another file, isn't on screen either.
			urlBackToShown();
			return;
		}
		endLoad();
		lasMemory = { fileName: file.name, log };
		// The link on screen asked for this file: it opens at the link's interval, in the link's entry.
		const asked = key === fileKey && shown?.key !== fileKey;
		// The URL names a well the read cut short: its entry becomes the file's.
		// A file still waiting for its entry isn't one: the URL's entry is real.
		const abandoned = !asked && shown !== null && shown !== unpushed && key !== shown.key;
		interval = asked ? link.interval : null;
		const opened: Shown = { source, key: fileKey, log, entry: lasEntry(log, file.name) };
		shown = opened;
		if (asked) return;
		unpushed = opened;
		// Navigating reads the scroll position, which lays out the tracks just
		// built for the file there and then, in the same task as building
		// them. After the frame that lays them out, it is cheap.
		const url = page.url.href;
		await afterNextFrame();
		// Something else took over meanwhile: a pick, Back or Forward, or another file.
		if (shown !== opened || loading !== null || page.url.href !== url) return;
		pushed = null;
		unpushed = null;
		// The interval is the whole well's unless the reader has moved since.
		writeUrl(linkTo(source, interval), abandoned ? 'replace' : 'push');
	}

	/** Resolves once the next frame has been drawn. */
	function afterNextFrame(): Promise<void> {
		return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve)));
	}

	let note = $state<string | null>(null);
	let noteTimer: ReturnType<typeof setTimeout> | undefined;

	function showNote(text: string) {
		clearTimeout(noteTimer);
		note = text;
		noteTimer = setTimeout(() => (note = null), NOTE_MS);
	}

	// A file dragged over the page shows the overlay. Enter and leave fire
	// for every element crossed, so the overlay follows their balance.
	let dragging = $state(false);
	let dragDepth = 0;

	function carriesFiles(event: DragEvent): boolean {
		return event.dataTransfer?.types.includes('Files') ?? false;
	}

	function ondragenter(event: DragEvent) {
		if (!carriesFiles(event)) return;
		event.preventDefault();
		dragDepth++;
		dragging = true;
	}

	function ondragover(event: DragEvent) {
		if (!carriesFiles(event)) return;
		// Without this the browser opens the file in place of the page.
		event.preventDefault();
		if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
	}

	function ondragleave(event: DragEvent) {
		if (!carriesFiles(event)) return;
		dragDepth = Math.max(0, dragDepth - 1);
		if (dragDepth === 0) dragging = false;
	}

	function ondrop(event: DragEvent) {
		if (!carriesFiles(event)) return;
		event.preventDefault();
		dragDepth = 0;
		dragging = false;
		const files = [...(event.dataTransfer?.files ?? [])];
		if (files.length === 0) return;
		// Every file is read as LAS; .json templates come with the template file ticket (#57).
		openFile(files[0]);
		if (files.length > 1) showNote(skippedNote(files[0].name, files.length - 1));
	}
</script>

<svelte:window {ondragenter} {ondragover} {ondragleave} {ondrop} />

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
			<OpenLasButton bind:this={opener} onfile={openFile} />
		{/snippet}
	</AppHeader>
	<main class="logs-content">
		{#if shown}
			<div class="stage" class:dimmed={loading !== null} inert={loading !== null}>
				<LogView
					log={shown.log}
					bind:template
					bind:interval={() => interval, (next) => ((interval = next), settleUrl())}
					bind:depthRef={() => depthRef, (next) => ((depthRef = next), settleUrl())}
					scheme={themeStore.theme}
				/>
			</div>
			{#if loading}
				<div class="overlay">
					<LoadingSpinner message={`Loading ${entryName(loading.entry)}…`} />
				</div>
			{:else if failure}
				<div class="banner" role="alert">
					<span>{failure.message}</span>
					<div class="banner-actions">
						{#if failure.kind === 'ask'}
							<button type="button" onclick={() => opener?.open()}>Open LAS file…</button>
						{/if}
						{#if failure.retry}
							<button type="button" onclick={retry}>Retry</button>
						{/if}
						<button type="button" onclick={() => (failure = null)}>Dismiss</button>
					</div>
				</div>
			{/if}
		{:else if loading}
			<div class="state">
				<LoadingSpinner message={`Loading ${entryName(loading.entry)}…`} />
			</div>
		{:else if failure}
			<div class="state" role="alert">
				<h2>{failureHeadings[failure.kind](failure.id)}</h2>
				<p>{failure.message}</p>
				{#if failure.kind !== 'well'}
					<button type="button" class="state-action" onclick={() => opener?.open()}>Open LAS file…</button>
				{:else if failure.retry}
					<button type="button" class="state-action" onclick={retry}>Retry</button>
				{/if}
			</div>
		{:else}
			<div class="state">
				<LoadingSpinner message="Loading…" />
			</div>
		{/if}
		{#if note}
			<div class="note" role="status">
				<span>{note}</span>
				<button type="button" onclick={() => (note = null)}>Dismiss</button>
			</div>
		{/if}
	</main>
	{#if dragging}
		<div class="drop" aria-hidden="true">
			<p>Drop a LAS file to open it</p>
		</div>
	{/if}
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
	.note button,
	.state-action {
		padding: 2px var(--spacing-sm);
		font: inherit;
		font-size: var(--font-size-sm);
		color: var(--color-accent);
		background: none;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		cursor: pointer;
	}

	.note {
		position: absolute;
		bottom: var(--spacing-lg);
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
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-lg);
	}

	.drop {
		position: fixed;
		inset: 0;
		z-index: 50;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--spacing-xl);
		background: color-mix(in srgb, var(--color-background) 75%, transparent);
		pointer-events: none;
	}

	.drop p {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 100%;
		margin: 0;
		font-size: var(--font-size-lg);
		font-weight: 600;
		color: var(--color-accent);
		border: 2px dashed var(--color-accent);
		border-radius: var(--radius-lg);
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
