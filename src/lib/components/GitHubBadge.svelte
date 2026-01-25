<script lang="ts">
  /**
   * GitHubBadge Component
   *
   * Displays repository info with version, stars, and forks count.
   * Subtle design that fits in the top-right corner of the header.
   */

  interface Props {
    repo?: string;
    version?: string;
  }

  let { repo = "oskrgab/volve-explorer", version = "0.1.0" }: Props = $props();

  // GitHub repo URL
  const repoUrl = `https://github.com/${repo}`;
</script>

<a
  href={repoUrl}
  class="github-badge"
  target="_blank"
  rel="noopener noreferrer"
  aria-label="View on GitHub"
>
  <!-- GitHub Icon -->
  <svg
    class="github-icon"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
  >
    <path
      fill-rule="evenodd"
      clip-rule="evenodd"
      d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0012 2z"
    />
  </svg>

  <span class="repo-name">{repo}</span>

  <span class="divider"></span>

  <span class="badge-item version">
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path
        d="M2.5 7.775V2.75a.25.25 0 0 1 .25-.25h5.025a.25.25 0 0 1 .177.073l6.25 6.25a.25.25 0 0 1 0 .354l-5.025 5.025a.25.25 0 0 1-.354 0l-6.25-6.25a.25.25 0 0 1-.073-.177Zm-1.5 0V2.75C1 1.784 1.784 1 2.75 1h5.025c.464 0 .91.184 1.238.513l6.25 6.25a1.75 1.75 0 0 1 0 2.474l-5.026 5.026a1.75 1.75 0 0 1-2.474 0l-6.25-6.25A1.752 1.752 0 0 1 1 7.775ZM6 5a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z"
      />
    </svg>
    {version}
  </span>
</a>

<style>
  .github-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 0.75rem;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-full);
    font-size: var(--font-size-xs);
    font-family: var(--font-mono);
    color: var(--color-text-secondary);
    text-decoration: none;
    transition: all var(--transition-fast);
    box-shadow: var(--shadow-sm);
  }

  .github-badge:hover {
    color: var(--color-text);
    border-color: var(--color-border-strong);
    box-shadow: var(--shadow-md);
    transform: translateY(-1px);
    text-decoration: none;
  }

  .github-icon {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }

  .repo-name {
    font-weight: 500;
    color: var(--color-text);
  }

  .divider {
    width: 1px;
    height: 12px;
    background: var(--color-border);
  }

  .badge-item {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
  }

  .badge-item svg {
    width: 12px;
    height: 12px;
    opacity: 0.7;
  }

  .version {
    color: var(--color-text-muted);
  }

  /* Responsive: hide text on very small screens */
  @media (max-width: 480px) {
    .repo-name {
      display: none;
    }

    .divider {
      display: none;
    }

    .github-badge {
      padding: 0.375rem 0.5rem;
    }
  }
</style>
