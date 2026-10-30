<script lang="ts">
	/**
	 * Well Logs Page
	 *
	 * The log view's own route. It shares the header with the production
	 * dashboard but never imports DuckDB, so a cold visit doesn't wait for it.
	 */

	import AppHeader from '$lib/components/AppHeader.svelte';
</script>

<svelte:head>
	<title>Well logs · petroviz</title>
</svelte:head>

<div class="logs-page">
	<AppHeader />
	<main class="logs-content"></main>
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
