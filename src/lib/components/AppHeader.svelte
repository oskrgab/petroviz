<script lang="ts">
  /**
   * AppHeader Component
   *
   * The header shared by every page: the petroviz title (a link to the
   * welcome page), a link to each visualization in the catalog with the
   * current one highlighted, the dataset line naming what is on screen
   * (inside a visualization only), a slot for the page's own controls, then
   * the GitHub link and the theme toggle.
   */

  import type { Snippet } from "svelte";
  import { page } from "$app/state";
  import { resolve } from "$app/paths";
  import { CATALOG } from "$lib/config/data-sources";
  import ThemeToggle from "./ThemeToggle.svelte";
  import type { OnScreen } from "$lib/config/catalog.js";
  import DatasetLine from "./DatasetLine.svelte";

  interface Props {
    /** What the visualization has on screen. The welcome page passes none. */
    onScreen?: OnScreen;
    /** The page's own controls, placed between the nav and the GitHub link. */
    controls?: Snippet;
  }

  let { onScreen, controls }: Props = $props();

  type Path = Parameters<typeof resolve>[0];

  const welcomePage = resolve("/");
  const links = CATALOG.visualizations.map((v) => ({
    href: resolve(v.route as Path),
    label: v.name,
  }));

  // Compare without a trailing slash, so /logs and /logs/ both match
  function isCurrent(href: string): boolean {
    const strip = (path: string) => path.replace(/\/+$/, "");
    return strip(page.url.pathname) === strip(href);
  }
</script>

<header class="app-header">
  <div class="header-left">
    <a href={welcomePage} class="logo-section">
      <!-- Oil drop icon -->
      <div class="logo-icon">
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path
            d="M12 2C12 2 5 10 5 15C5 18.866 8.134 22 12 22C15.866 22 19 18.866 19 15C19 10 12 2 12 2ZM12 20C9.239 20 7 17.761 7 15C7 11.512 11 5.695 12 4.357C13 5.695 17 11.512 17 15C17 17.761 14.761 20 12 20Z"
          />
          <ellipse
            cx="12"
            cy="15"
            rx="4"
            ry="5"
            fill="currentColor"
            opacity="0.3"
          />
        </svg>
      </div>
      <h1 class="title">petroviz</h1>
    </a>
    <nav class="nav-section" aria-label="Visualizations">
      {#each links as link (link.href)}
        <a
          href={link.href}
          class="nav-link"
          class:active={isCurrent(link.href)}
          aria-current={isCurrent(link.href) ? "page" : undefined}
        >
          {link.label}
        </a>
      {/each}
    </nav>
    {#if onScreen}
      <div class="on-screen" class:file={"file" in onScreen}>
        <DatasetLine {onScreen} />
      </div>
    {/if}
  </div>

  {#if controls}
    <div class="header-controls">
      {@render controls()}
    </div>
  {/if}

  <div class="header-right">
    <a
      href="https://github.com/oskrgab/petroviz"
      class="github-link"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="View on GitHub"
      title="View on GitHub"
    >
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path
          fill-rule="evenodd"
          clip-rule="evenodd"
          d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0012 2z"
        />
      </svg>
    </a>
    <ThemeToggle />
  </div>
</header>

<style>
  .app-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-sm) 0;
    border-bottom: 1px solid var(--color-border);
    background: var(--color-background);
    flex-shrink: 0;
    gap: var(--spacing-sm);
    min-height: 60px;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: var(--spacing-lg);
    flex: 1;
    min-width: 0;
    overflow: hidden;
  }

  .logo-section {
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
    flex-shrink: 0;
    color: inherit;
    border-radius: var(--radius-lg);
  }

  .logo-section:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 4px;
  }

  .logo-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    background: linear-gradient(
      135deg,
      var(--color-oil) 0%,
      var(--color-oil-soft) 100%
    );
    border-radius: var(--radius-lg);
    color: white;
    box-shadow: var(--shadow-md);
    flex-shrink: 0;
  }

  .logo-icon svg {
    width: 26px;
    height: 26px;
  }

  .title {
    font-size: var(--font-size-xl);
    font-weight: 700;
    letter-spacing: -0.03em;
    line-height: 1;
    margin: 0;
    background: linear-gradient(
      135deg,
      var(--color-text) 0%,
      var(--color-text-secondary) 100%
    );
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    white-space: nowrap;
  }

  .nav-section {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    /* Room for the active underline, which overflow-x: auto would clip */
    padding: 4px 0 4px var(--spacing-md);
    border-left: 1px solid var(--color-border);
    flex: 0 1 auto;
    min-width: 0;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .nav-link {
    position: relative;
    display: flex;
    align-items: center;
    padding: var(--spacing-xs) var(--spacing-sm);
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    font-weight: 500;
    letter-spacing: 0.01em;
    color: var(--color-text-secondary);
    text-decoration: none;
    border-radius: var(--radius-sm);
    transition: all var(--transition-fast);
    white-space: nowrap;
  }

  .nav-link:hover {
    color: var(--color-text);
    background: var(--color-accent-soft);
  }

  .nav-link:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }

  /* Text colour, not the accent, so the label meets AA on the light surface */
  .nav-link.active {
    color: var(--color-text);
    font-weight: 600;
  }

  /* Active indicator line */
  .nav-link.active::after {
    content: "";
    position: absolute;
    bottom: -2px;
    left: var(--spacing-sm);
    right: var(--spacing-sm);
    height: 2px;
    background: var(--color-accent);
    border-radius: 1px;
  }

  /*
   * Shrinks before the nav does: a long file name is cut, not the links. A
   * dataset's line stops at its name over its links, as narrow as it reads.
   */
  .on-screen {
    display: flex;
    flex: 0 100 auto;
  }

  .on-screen.file {
    min-width: 0;
  }

  .header-controls {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    flex-shrink: 0;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
    flex-shrink: 0;
  }

  .github-link {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    color: var(--color-text-muted);
    border-radius: var(--radius-md);
    transition: all var(--transition-fast);
    flex-shrink: 0;
  }

  .github-link:hover {
    color: var(--color-text);
    background: var(--color-accent-soft);
  }

  .github-link svg {
    width: 20px;
    height: 20px;
  }

  /* ==================== RESPONSIVE: TABLET ==================== */
  @media (max-width: 1024px) {
    .header-left {
      gap: var(--spacing-md);
    }
  }

  /* ==================== RESPONSIVE: MOBILE ==================== */
  @media (max-width: 768px) {
    .header-left {
      gap: var(--spacing-sm);
    }

    .logo-section {
      gap: var(--spacing-sm);
    }

    .logo-icon {
      width: 38px;
      height: 38px;
    }

    .logo-icon svg {
      width: 22px;
      height: 22px;
    }

    .title {
      font-size: var(--font-size-lg);
    }
  }

  /* ==================== RESPONSIVE: SMALL MOBILE ==================== */
  @media (max-width: 480px) {
    /* The visualization links take a row of their own below the title */
    .app-header {
      flex-wrap: wrap;
      row-gap: 0;
    }

    .header-left {
      display: contents;
    }

    .nav-section {
      order: 10;
      flex-basis: 100%;
      padding-bottom: var(--spacing-xs);
    }

    .title {
      font-size: var(--font-size-md);
    }

    .header-left {
      gap: var(--spacing-xs);
    }

    .nav-section {
      padding-left: 0;
      border-left: none;
    }

    .logo-section {
      margin-right: auto;
    }

    /*
     * The dataset line sits beside the title, so the space falls after it.
     * Not with the page's controls on that row: they hold the title's place.
     */
    .app-header:not(:has(.header-controls))
      .logo-section:has(+ .nav-section + .on-screen) {
      margin-right: 0;
    }

    .on-screen {
      margin-right: auto;
    }

    .nav-link {
      padding: var(--spacing-xs);
      letter-spacing: 0;
    }

    /* Make room for both page links on a phone */
    .logo-icon {
      display: none;
    }

    .header-right {
      gap: var(--spacing-sm);
    }

    .github-link {
      width: 28px;
      height: 28px;
    }

    .github-link svg {
      width: 16px;
      height: 16px;
    }
  }

  /*
   * The narrowest phones, inside a visualization: the oil drop stands in for
   * the wordmark, so the dataset line still fits beside it on one row. The
   * wordmark stays as the link's accessible name.
   */
  @media (max-width: 359px) {
    .app-header:has(.on-screen):not(:has(.header-controls)) .logo-icon {
      display: flex;
      width: 28px;
      height: 28px;
      border-radius: var(--radius-md);
    }

    .app-header:has(.on-screen):not(:has(.header-controls)) .logo-icon svg {
      width: 18px;
      height: 18px;
    }

    .app-header:has(.on-screen):not(:has(.header-controls)) .title {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
  }

  /* ==================== WITH THE PAGE'S CONTROLS ==================== */
  /*
   * The well logs' header also holds the page's controls, so the dataset
   * line has no row of its own to take, and the log view needs every pixel
   * of depth below it. The line finds room in the rows already there.
   */

  /*
   * Tablets: the oil drop stands in for the wordmark, as on the narrowest
   * phones. Below 720px the production dashboard's line needs the room too.
   */
  @media (min-width: 481px) and (max-width: 880px) {
    .app-header:has(.header-controls):has(.on-screen) .title {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
  }

  @media (min-width: 481px) and (max-width: 720px) {
    .app-header:has(.on-screen) .title {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
  }

  /* Phones: the controls fill the title's row, so the line follows the nav on its row */
  @media (max-width: 480px) {
    .app-header:has(.header-controls) .nav-section {
      flex-basis: auto;
    }

    .app-header:has(.header-controls) .on-screen {
      order: 11;
    }

    /*
     * A file name joins a row by a few characters and takes what room is
     * left there: at its full width it would wrap to a row of its own.
     */
    .app-header:has(.header-controls) .on-screen.file {
      flex: 1 1 6rem;
    }
  }

  /*
   * Too narrow for the nav and the line on one row, where the GitHub link
   * and the theme toggle already take a row of their own: the line goes
   * there, before them, and the nav keeps the last row to itself. With a
   * well's name in the picker, they leave the title's row below 365px.
   */
  @media (max-width: 364px) {
    .app-header:has(.header-controls) .on-screen {
      order: 5;
    }

    .app-header:has(.header-controls) .header-right {
      order: 6;
    }

    .app-header:has(.header-controls) .nav-section {
      flex-basis: 100%;
    }

    /* It starts its row, so there is nothing for its rule to set it apart from */
    .app-header:has(.header-controls) .on-screen :global(.dataset-line) {
      padding-left: 0;
      border-left: none;
    }
  }

  /*
   * The same from 405px with a file open: the picker names the file too and
   * fills its 9rem, so the GitHub link and the theme toggle leave the
   * title's row sooner.
   */
  @media (max-width: 405px) {
    .app-header:has(.header-controls):has(.on-screen.file) .on-screen {
      order: 5;
    }

    .app-header:has(.header-controls):has(.on-screen.file) .header-right {
      order: 6;
    }

    .app-header:has(.header-controls):has(.on-screen.file) .nav-section {
      flex-basis: 100%;
    }

    .app-header:has(.header-controls):has(.on-screen.file) .on-screen :global(.dataset-line) {
      padding-left: 0;
      border-left: none;
    }
  }
</style>
