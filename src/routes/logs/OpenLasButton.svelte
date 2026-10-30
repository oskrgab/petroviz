<script lang="ts">
  /**
   * OpenLasButton
   *
   * Open LAS file, in the shared header: a file picker that accepts any
   * file, since LAS files don't always end in `.las`. At tablet width it
   * shrinks to its icon. `open()` lets the page offer the same picker
   * elsewhere, such as when a link asks for its file again.
   */

  interface Props {
    onfile: (file: File) => void;
  }

  let { onfile }: Props = $props();

  let input: HTMLInputElement;

  /** Show the file picker. */
  export function open() {
    input.click();
  }

  function onchange() {
    const file = input.files?.[0];
    // Cleared, so choosing the same file again still opens it.
    input.value = "";
    if (file) onfile(file);
  }
</script>

<button type="button" class="open" title="Open a LAS file from disk" onclick={open}>
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path
      fill="currentColor"
      d="M3.75 1.5A1.75 1.75 0 0 0 2 3.25v9.5c0 .97.78 1.75 1.75 1.75h8.5c.97 0 1.75-.78 1.75-1.75V5.56c0-.46-.18-.9-.51-1.23L10.67 1.5a1.75 1.75 0 0 0-1.23-.51H3.75Zm0 1.5h5.5v2.25c0 .41.34.75.75.75h2.5v6.75a.25.25 0 0 1-.25.25h-8.5a.25.25 0 0 1-.25-.25v-9.5c0-.14.11-.25.25-.25Zm4.25 4a.75.75 0 0 1 .75.75v1.5h1.5a.75.75 0 0 1 0 1.5h-1.5v1.5a.75.75 0 0 1-1.5 0v-1.5h-1.5a.75.75 0 0 1 0-1.5h1.5v-1.5A.75.75 0 0 1 8 7Z"
    />
  </svg>
  <span class="label">Open LAS file</span>
</button>
<input bind:this={input} type="file" hidden {onchange} />

<style>
  .open {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    height: 32px;
    padding: 0 var(--spacing-sm);
    font: inherit;
    font-size: var(--font-size-sm);
    color: var(--color-text);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    cursor: pointer;
    white-space: nowrap;
  }

  .open:hover {
    border-color: var(--color-border-strong);
  }

  .open:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }

  svg {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    color: var(--color-text-muted);
  }

  @media (max-width: 1024px) {
    .label {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  }
</style>
