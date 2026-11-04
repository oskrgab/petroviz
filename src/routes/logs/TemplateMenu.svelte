<script lang="ts">
  /**
   * TemplateMenu
   *
   * The Template menu in the shared header: Save to file…, Open file… and
   * Reset to default. Save to file… turns the menu into a small prompt for
   * the name, prefilled with the template's; the host writes the name into
   * the template and downloads it. Open file… picks a `.json` file for the
   * host to read. At tablet width the button shrinks to its icon.
   */

  import { tick } from "svelte";

  interface Props {
    /** The current template's name, to prefill the prompt. */
    name: string;
    onsave: (name: string) => void;
    onopen: (file: File) => void;
    onreset: () => void;
  }

  let { name, onsave, onopen, onreset }: Props = $props();

  const uid = $props.id();

  let root: HTMLDivElement;
  let trigger: HTMLButtonElement;
  let fileInput: HTMLInputElement;
  let menu = $state<HTMLDivElement>();
  let nameInput = $state<HTMLInputElement>();
  let open = $state(false);
  /** The prompt for the name, in place of the menu. */
  let naming = $state(false);
  let draft = $state("");

  const items = () => [...(menu?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];

  async function show() {
    open = true;
    naming = false;
    await tick();
    items()[0]?.focus();
  }

  function close(refocus: boolean) {
    open = false;
    naming = false;
    if (refocus) trigger.focus();
  }

  async function startSave() {
    draft = name;
    naming = true;
    await tick();
    nameInput?.select();
  }

  function save(event: SubmitEvent) {
    event.preventDefault();
    const entered = draft.trim();
    if (!entered) return;
    close(true);
    onsave(entered);
  }

  function pickFile() {
    close(true);
    fileInput.click();
  }

  function reset() {
    close(true);
    onreset();
  }

  function onchange() {
    const file = fileInput.files?.[0];
    // Cleared, so choosing the same file again still opens it.
    fileInput.value = "";
    if (file) onopen(file);
  }

  function onmenukeydown(event: KeyboardEvent) {
    const all = items();
    const at = all.indexOf(document.activeElement as HTMLButtonElement);
    const to: Record<string, number> = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: all.length - 1 };
    if (!(event.key in to)) return;
    event.preventDefault();
    all[(to[event.key] + all.length) % all.length]?.focus();
  }

  // Escape closes the menu or the prompt, from anywhere in it.
  function onpopoverkeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      close(true);
    }
  }

  // A press anywhere outside closes it, leaving focus where it went; so
  // does focus moving out of it.
  function onwindowpointerdown(event: PointerEvent) {
    if (open && !root.contains(event.target as Node)) close(false);
  }

  function onfocusout(event: FocusEvent) {
    const to = event.relatedTarget as Node | null;
    if (open && to && !root.contains(to)) close(false);
  }
</script>

<svelte:window onpointerdown={onwindowpointerdown} />

<div class="template-menu" bind:this={root} {onfocusout}>
  <button
    type="button"
    class="trigger"
    aria-haspopup="menu"
    aria-expanded={open}
    aria-controls={open ? `${uid}-popover` : undefined}
    title="Save, open or reset the template"
    bind:this={trigger}
    onclick={() => (open ? close(false) : show())}
  >
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M2.75 2A1.75 1.75 0 0 0 1 3.75v8.5C1 13.22 1.78 14 2.75 14h10.5c.97 0 1.75-.78 1.75-1.75v-8.5C15 2.78 14.22 2 13.25 2H2.75Zm0 1.5H5v9H2.75a.25.25 0 0 1-.25-.25v-8.5c0-.14.11-.25.25-.25Zm3.75 0h3v9h-3v-9Zm4.5 0h2.25c.14 0 .25.11.25.25v8.5a.25.25 0 0 1-.25.25H11v-9Z"
      />
    </svg>
    <span class="label">Template</span>
    <svg class="chevron" viewBox="0 0 16 16" aria-hidden="true">
      <path fill="currentColor" d="M4.2 6.2a.75.75 0 0 1 1.06 0L8 8.94l2.74-2.74a.75.75 0 1 1 1.06 1.06l-3.27 3.27a.75.75 0 0 1-1.06 0L4.2 7.26a.75.75 0 0 1 0-1.06Z" />
    </svg>
  </button>

  {#if open && naming}
    <div id={`${uid}-popover`} class="popover prompt" role="dialog" aria-label="Save the template to a file" tabindex="-1" onkeydown={onpopoverkeydown}>
      <form onsubmit={save}>
        <label for={`${uid}-name`}>Template name</label>
        <input id={`${uid}-name`} bind:this={nameInput} bind:value={draft} type="text" autocomplete="off" spellcheck="false" />
        <div class="actions">
          <button type="button" onclick={() => close(true)}>Cancel</button>
          <button type="submit" class="primary" disabled={!draft.trim()}>Save</button>
        </div>
      </form>
    </div>
  {:else if open}
    <div id={`${uid}-popover`} class="popover" role="menu" aria-label="Template" tabindex="-1" bind:this={menu} onkeydown={(e) => (onpopoverkeydown(e), onmenukeydown(e))}>
      <button type="button" role="menuitem" tabindex="-1" onclick={startSave}>Save to file…</button>
      <button type="button" role="menuitem" tabindex="-1" onclick={pickFile}>Open file…</button>
      <button type="button" role="menuitem" tabindex="-1" onclick={reset}>Reset to default</button>
    </div>
  {/if}
</div>
<input bind:this={fileInput} type="file" accept=".json,application/json" hidden {onchange} />

<style>
  .template-menu {
    position: relative;
  }

  .trigger {
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

  .trigger:hover {
    border-color: var(--color-border-strong);
  }

  .trigger:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }

  svg {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    color: var(--color-text-muted);
  }

  .popover {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    z-index: 20;
    display: flex;
    flex-direction: column;
    min-width: 12rem;
    padding: var(--spacing-xs) 0;
    background: var(--color-surface-elevated);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
    outline: none;
  }

  [role="menuitem"] {
    padding: var(--spacing-xs) var(--spacing-md);
    font: inherit;
    font-size: var(--font-size-sm);
    text-align: left;
    color: var(--color-text);
    background: none;
    border: none;
    cursor: pointer;
  }

  [role="menuitem"]:hover,
  [role="menuitem"]:focus-visible {
    background: var(--color-surface-sunken);
    outline: none;
  }

  .prompt {
    width: min(18rem, calc(100vw - 2 * var(--spacing-sm)));
    padding: var(--spacing-sm);
  }

  .prompt form {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }

  .prompt label {
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
  }

  .prompt input {
    padding: var(--spacing-xs) var(--spacing-sm);
    font: inherit;
    font-size: var(--font-size-sm);
    color: var(--color-text);
    background: var(--color-surface-sunken);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
  }

  .prompt input:focus {
    outline: 2px solid var(--color-accent);
    outline-offset: -1px;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--spacing-xs);
    margin-top: var(--spacing-xs);
  }

  .actions button {
    padding: 2px var(--spacing-sm);
    font: inherit;
    font-size: var(--font-size-sm);
    color: var(--color-text);
    background: none;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    cursor: pointer;
  }

  .actions .primary {
    color: var(--color-accent);
    border-color: var(--color-accent);
  }

  .actions button:disabled {
    opacity: 0.5;
    cursor: default;
  }

  /* Up to 1120px the header also names FORCE 2020 or the file on screen */
  @media (max-width: 1120px) {
    .label {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }

    .chevron {
      display: none;
    }
  }
</style>
