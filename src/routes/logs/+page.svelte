<script lang="ts">
	/**
	 * Well Logs Page
	 *
	 * The log view's host. It loads the FORCE 2020 well named by `?well=<file
	 * stem>` (35-11-11 when there is none), shows a spinner while it loads and
	 * a full error state if it fails, and hands the well log to the log view.
	 *
	 * It shares the header with the production dashboard but never imports
	 * DuckDB, so a cold visit doesn't wait for it.
	 */

	import { page } from '$app/state';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import { getConfigSummary } from '$lib/config/data-sources';
	import { themeStore } from '$lib/stores/theme.svelte';
	import { loadWell } from '$lib/sources/force2020';
	import type { WellLog } from '$lib/welllog/core';
	import { LogView } from '$lib/welllog/view';

	const DEFAULT_WELL = '35-11-11';

	type Status =
		| { kind: 'loading'; id: string }
		| { kind: 'error'; id: string; message: string }
		| { kind: 'ready'; log: WellLog };

	const { dataHost, schemaHost } = getConfigSummary();

	const wellId = $derived(page.url.searchParams.get('well') ?? DEFAULT_WELL);

	// Raw: a well log is immutable and holds large typed arrays, so it is never proxied.
	let status = $state.raw<Status>({ kind: 'loading', id: DEFAULT_WELL });

	$effect(() => {
		const id = wellId;
		const controller = new AbortController();
		status = { kind: 'loading', id };
		loadWell(id, { signal: controller.signal, dataHost, schemaHost }).then(
			(log) => {
				if (!controller.signal.aborted) status = { kind: 'ready', log };
			},
			(error: unknown) => {
				if (controller.signal.aborted) return;
				const message = error instanceof Error ? error.message : String(error);
				status = { kind: 'error', id, message };
			}
		);
		return () => controller.abort();
	});
</script>

<svelte:head>
	<title>Well logs · petroviz</title>
</svelte:head>

<div class="logs-page">
	<AppHeader />
	<main class="logs-content">
		{#if status.kind === 'ready'}
			<LogView log={status.log} scheme={themeStore.theme} />
		{:else if status.kind === 'loading'}
			<div class="state">
				<LoadingSpinner message={`Loading well ${status.id}…`} />
			</div>
		{:else}
			<div class="state" role="alert">
				<h2>Well {status.id} couldn't be opened</h2>
				<p>{status.message}</p>
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
		flex: 1;
		min-height: 0;
		padding-bottom: var(--spacing-md);
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
