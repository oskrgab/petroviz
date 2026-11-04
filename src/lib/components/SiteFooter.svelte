<script lang="ts">
  /**
   * SiteFooter Component
   *
   * Credits petrodb for the data and the author for petroviz. Shown on the
   * welcome page only: the visualizations give their full height to the data.
   */
</script>

<footer class="site-footer">
  <span class="footer-text">
    Data from <a href="https://petrodb.ocortez.com" target="_blank" rel="noopener"
      >petrodb</a
    >
  </span>
  <span class="footer-text">
    Made with ❤️ by <a href="https://ocortez.com" target="_blank" rel="noopener"
      >Oscar Cortez</a
    >
  </span>
</footer>

<style>
  .site-footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-xs) var(--spacing-md);
    padding: var(--spacing-md) 0;
    border-top: 1px solid var(--color-border);
    min-height: 48px;
  }

  .footer-text {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  /* Text colour with an accent underline: the accent alone misses AA on light */
  .footer-text a {
    color: var(--color-text);
    font-weight: 500;
    text-decoration: underline;
    text-decoration-color: var(--color-accent);
    text-underline-offset: 3px;
  }

  .footer-text a:hover {
    color: var(--color-accent-hover);
  }
</style>
