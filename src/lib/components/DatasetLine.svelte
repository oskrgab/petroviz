<script lang="ts" module>
  import type { Dataset } from "$lib/config/catalog.js";

  /** What a visualization has on screen: a catalog dataset, or a file the user opened. */
  export type OnScreen = { dataset: Dataset } | { file: string };
</script>

<script lang="ts">
  /**
   * DatasetLine Component
   *
   * Names what a visualization has on screen, inside the header. A dataset
   * from the catalog shows its name, then its Docs, Data and License links.
   * A file the user opened shows its name only: the data is theirs, not
   * petrodb's, so there is nothing to link to. A long file name is cut to
   * fit, with the whole name on hover and in its accessible name.
   */

  let { onScreen }: { onScreen: OnScreen } = $props();
</script>

<!-- srSuffix completes the label for screen readers: "Docs" + " for Volve" -->
{#snippet external(label: string, href: string, title: string | undefined, srSuffix: string)}
  <a {href} {title} target="_blank" rel="noopener"
    >{label}<span class="sr-only">{srSuffix} (opens in a new tab)</span></a
  >
{/snippet}

<p class="dataset-line">
  {#if "dataset" in onScreen}
    {@const dataset = onScreen.dataset}
    {@const forName = ` for ${dataset.name}`}
    <span class="name"><span class="sr-only">Dataset: </span>{dataset.name}</span>
    <span class="links">
      {@render external("Docs", dataset.docs, undefined, forName)}
      {@render external("Data", dataset.data, `On ${dataset.dataOn}`, `${forName}, on ${dataset.dataOn}`)}
      {@render external("License", dataset.license, undefined, forName)}
    </span>
  {:else}
    <span class="name file" title={onScreen.file}
      ><span class="sr-only">File: </span>{onScreen.file}</span
    >
  {/if}
</p>

<style>
  /*
   * A rule on the left, like the nav's: brand | visualizations | what's on
   * screen. The name is what the line is about; the links come second, in
   * the welcome page's link style so the two read as the same thing.
   */
  .dataset-line {
    display: flex;
    align-items: baseline;
    gap: var(--spacing-xs) var(--spacing-md);
    min-width: 0;
    margin: 0;
    padding-left: var(--spacing-md);
    border-left: 1px solid var(--color-border);
    line-height: 1.25;
    white-space: nowrap;
  }

  .name {
    font-size: var(--font-size-base);
    font-weight: 600;
    color: var(--color-text);
    letter-spacing: -0.01em;
  }

  /* A file name is a value: mono, and cut to fit with an ellipsis */
  .name.file {
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
    font-weight: 500;
    letter-spacing: 0;
    min-width: 0;
    max-width: 28ch;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .links {
    display: flex;
    gap: var(--spacing-md);
    font-size: var(--font-size-xs);
  }

  .links a {
    color: var(--color-text-secondary);
    text-decoration: underline;
    text-decoration-color: var(--color-border-strong);
    text-underline-offset: 3px;
  }

  .links a:hover {
    color: var(--color-text);
    text-decoration-color: var(--color-accent);
  }

  .links a:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
    border-radius: 2px;
  }

  /*
   * Phones: the name sits over its links, so the line takes the room of one
   * header control and the header keeps its two rows.
   */
  @media (max-width: 480px) {
    /* Two 14px lines: no taller than the GitHub link and theme toggle beside it */
    .dataset-line {
      flex-direction: column;
      align-items: flex-start;
      gap: 0;
      padding-left: var(--spacing-sm);
      line-height: 14px;
    }

    .name {
      font-size: var(--font-size-sm);
    }

    .links a {
      text-underline-offset: 2px;
    }

    .name.file {
      font-size: var(--font-size-xs);
      max-width: 100%;
    }

    .links {
      gap: var(--spacing-sm);
    }
  }
</style>
