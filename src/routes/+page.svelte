<script lang="ts">
	/**
	 * Welcome Page
	 *
	 * The page petroviz opens on. It lists the visualizations from the
	 * catalog, each with what it shows and the datasets it shows, linked to
	 * their docs, data and licence. It loads no data: nothing is fetched from
	 * the Data host or the Schema host and DuckDB never starts, so only the
	 * visualization the visitor picks pays for its data.
	 */

	import { resolve } from '$app/paths';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import SiteFooter from '$lib/components/SiteFooter.svelte';
	import { CATALOG } from '$lib/config/data-sources';
	import PlotSketch from './PlotSketch.svelte';

	type Path = Parameters<typeof resolve>[0];
</script>

{#snippet external(label: string, href: string, dataset: string)}
	<a {href} target="_blank" rel="noopener"
		>{label}<span class="sr-only"> for {dataset} (opens in a new tab)</span></a
	>
{/snippet}

<svelte:head>
	<title>petroviz</title>
</svelte:head>

<div class="welcome">
	<AppHeader />

	<main class="content">
		<p class="lede">
			Open petroleum data from petrodb, drawn in your browser. Choose a visualization: nothing
			downloads until you do.
		</p>

		<ul class="choices">
			{#each CATALOG.visualizations as vis (vis.id)}
				<li class="choice {vis.runsAlong}">
					<div class="sketch-slot">
						<PlotSketch axis={vis.runsAlong} />
					</div>
					<div class="body">
						<h2 class="name">
							<a href={resolve(vis.route as Path)}>{vis.name}</a>
						</h2>
						<p class="summary">{vis.summary}</p>
						{#if vis.takesFile}
							<p class="summary">It can also open a LAS file from your computer.</p>
						{/if}
						{#each vis.datasets as dataset (dataset.id)}
							<p class="dataset">
								<span class="dataset-name">{dataset.name}</span>
								<span class="dataset-links">
									{@render external('Docs', dataset.docs, dataset.name)}
									{@render external('Data', dataset.data, dataset.name)}
									{@render external('License', dataset.license, dataset.name)}
								</span>
							</p>
						{/each}
					</div>
				</li>
			{/each}
		</ul>
	</main>

	<SiteFooter />
</div>

<style>
	.welcome {
		display: flex;
		flex-direction: column;
		min-height: 100vh;
		max-width: 1680px;
		margin: 0 auto;
		padding: 0 var(--spacing-xl);
	}

	.content {
		flex: 1;
		width: 100%;
		max-width: 46rem;
		padding: var(--spacing-2xl) 0;
	}

	/* Wide screens: the intro beside the choices, not above them */
	@media (min-width: 1100px) {
		.content {
			max-width: 72rem;
			display: grid;
			grid-template-columns: minmax(16rem, 22rem) minmax(0, 44rem);
			gap: var(--spacing-2xl);
			align-items: start;
		}

		.lede {
			margin-bottom: 0;
		}
	}

	.lede {
		font-size: var(--font-size-2xl);
		line-height: 1.4;
		letter-spacing: -0.015em;
		color: var(--color-text);
		max-width: 32ch;
		text-wrap: pretty;
		margin-bottom: var(--spacing-2xl);
	}

	.choices {
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xl);
	}

	.choice {
		border-top: 1px solid var(--color-border-strong);
		padding-top: var(--spacing-lg);
	}

	/* Production runs across time: its sketch spans the choice, above the name */
	.choice.time .sketch-slot {
		height: 64px;
		margin-bottom: var(--spacing-md);
	}

	/* Well logs run down depth: the sketch is a track beside the text */
	.choice.depth {
		display: grid;
		grid-template-columns: 48px 1fr;
		gap: var(--spacing-lg);
	}

	/* The track is as tall as the text beside it, not its drawing's own height */
	.choice.depth .sketch-slot {
		position: relative;
	}

	.choice.depth .sketch-slot :global(svg) {
		position: absolute;
		inset: 0;
	}

	.sketch-slot :global(svg) {
		width: 100%;
		height: 100%;
	}

	.name {
		font-size: var(--font-size-2xl);
		font-weight: 600;
		line-height: 1.25;
		margin-bottom: var(--spacing-sm);
	}

	.name a {
		color: var(--color-text);
		text-decoration: underline;
		text-decoration-color: var(--color-accent);
		text-decoration-thickness: 2px;
		text-underline-offset: 5px;
	}

	.name a:hover {
		text-decoration-thickness: 3px;
	}

	.summary {
		color: var(--color-text-secondary);
		max-width: 60ch;
		text-wrap: pretty;
	}

	.dataset {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--spacing-xs) var(--spacing-md);
		margin-top: var(--spacing-md);
		font-size: var(--font-size-sm);
	}

	.dataset-name {
		font-weight: 600;
		color: var(--color-text);
	}

	.dataset-links {
		display: flex;
		gap: var(--spacing-md);
	}

	.dataset-links a {
		color: var(--color-text-secondary);
		text-decoration: underline;
		text-decoration-color: var(--color-border-strong);
		text-underline-offset: 3px;
	}

	.dataset-links a:hover {
		color: var(--color-text);
		text-decoration-color: var(--color-accent);
	}

	@media (max-width: 1024px) {
		.welcome {
			padding: 0 var(--spacing-md);
		}
	}

	/* Phones: a fixed 16px gutter (the spacing tokens shrink at this width) */
	@media (max-width: 768px) {
		.welcome {
			padding: 0 16px;
		}

		.content {
			padding: var(--spacing-xl) 0;
		}

		.lede {
			margin-bottom: var(--spacing-xl);
		}

		.choice.depth {
			grid-template-columns: 36px 1fr;
			gap: var(--spacing-md);
		}
	}
</style>
