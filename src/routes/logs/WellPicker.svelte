<script lang="ts">
  /**
   * WellPicker
   *
   * The FORCE 2020 well picker in the shared header: a button naming the
   * current well that opens a searchable list of every well, sorted and
   * grouped by quadrant (wells.ts). Typing filters the list, ignoring
   * punctuation; the arrow keys move through it and Enter opens the well.
   * The list is the host's to load, so the picker only shows its state:
   * loading, failed with Retry, or ready. It stays usable while a well loads.
   */

  import { tick, untrack } from "svelte";
  import { filterWells, groupByQuadrant, type WellEntry, type WellList } from "./wells.ts";

  interface Props {
    /** Sorted, as sortWells leaves them. */
    list: WellList;
    /** The well the button names, or null before one is chosen. */
    current: WellEntry | null;
    open?: boolean;
    onpick: (id: string) => void;
    onretry: () => void;
  }

  let { list, current, open = $bindable(false), onpick, onretry }: Props = $props();

  const uid = $props.id();
  const listboxId = `${uid}-listbox`;
  const optionId = (id: string) => `${uid}-well-${id}`;

  let root: HTMLDivElement;
  let trigger: HTMLButtonElement;
  let input = $state<HTMLInputElement>();
  let listbox = $state<HTMLDivElement>();
  let popover = $state<HTMLDivElement>();
  let query = $state("");
  let active = $state(0);

  const matches = $derived(list.kind === "ready" ? filterWells(list.wells, query) : []);
  const groups = $derived(groupByQuadrant(matches));
  const activeWell = $derived(matches[active] as WellEntry | undefined);

  // Each opening starts from an empty search, on the current well, with the
  // search box focused: by the button, or by the host after a failed load.
  // A list that arrives while open does the same.
  // Until then the popover itself takes focus, so Escape still closes it.
  const ready = $derived(list.kind === "ready");
  $effect(() => {
    if (!open) return;
    if (ready) {
      untrack(() => {
        query = "";
        const at = current ? matches.findIndex((well) => well.id === current.id) : -1;
        active = Math.max(at, 0);
      });
    }
    tick().then(() => {
      (input ?? popover)?.focus();
      scrollToActive();
    });
  });

  function scrollToActive() {
    if (!activeWell || !listbox) return;
    listbox.querySelector(`#${CSS.escape(optionId(activeWell.id))}`)?.scrollIntoView({ block: "nearest" });
  }

  function close(refocus: boolean) {
    open = false;
    if (refocus) trigger.focus();
  }

  function pick(well: WellEntry) {
    close(true);
    onpick(well.id);
  }

  function move(to: number) {
    if (matches.length === 0) return;
    active = Math.min(Math.max(to, 0), matches.length - 1);
    tick().then(scrollToActive);
  }

  function onkeydown(event: KeyboardEvent) {
    const pageStep = 8;
    switch (event.key) {
      case "ArrowDown":
        move(active + 1);
        break;
      case "ArrowUp":
        move(active - 1);
        break;
      case "PageDown":
        move(active + pageStep);
        break;
      case "PageUp":
        move(active - pageStep);
        break;
      case "Enter":
        if (activeWell) pick(activeWell);
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  function oninput() {
    active = 0;
    tick().then(scrollToActive);
  }

  // A press anywhere outside closes the list, leaving focus where it went;
  // so does focus moving out of the picker, by Tab or otherwise.
  function onwindowpointerdown(event: PointerEvent) {
    if (open && !root.contains(event.target as Node)) close(false);
  }

  function onfocusout(event: FocusEvent) {
    const to = event.relatedTarget as Node | null;
    if (open && to && !root.contains(to)) close(false);
  }

  function ontriggerkeydown(event: KeyboardEvent) {
    if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      open = true;
    }
  }

  // Escape closes from anywhere in the list, whatever state it is in.
  function onpopoverkeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      close(true);
    }
  }
</script>

<svelte:window onpointerdown={onwindowpointerdown} />

<div class="well-picker" bind:this={root} {onfocusout}>
  <button
    type="button"
    class="trigger"
    aria-haspopup="dialog"
    aria-expanded={open}
    title={current ? `Well ${current.name}. Choose another well` : "Choose a well"}
    bind:this={trigger}
    onclick={() => (open = !open)}
    onkeydown={ontriggerkeydown}
  >
    <span class="label">{current?.name ?? "Choose a well"}</span>
    <svg class="chevron" viewBox="0 0 16 16" aria-hidden="true">
      <path fill="currentColor" d="M4.2 6.2a.75.75 0 0 1 1.06 0L8 8.94l2.74-2.74a.75.75 0 1 1 1.06 1.06l-3.27 3.27a.75.75 0 0 1-1.06 0L4.2 7.26a.75.75 0 0 1 0-1.06Z" />
    </svg>
  </button>

  {#if open}
    <div class="popover" role="dialog" aria-label="Choose a FORCE 2020 well" tabindex="-1" bind:this={popover} onkeydown={onpopoverkeydown}>
      {#if list.kind === "ready"}
        <input
          bind:this={input}
          bind:value={query}
          class="search"
          type="search"
          role="combobox"
          aria-expanded="true"
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={activeWell ? optionId(activeWell.id) : undefined}
          aria-label="Search FORCE 2020 wells"
          placeholder={`Search ${list.wells.length} wells`}
          autocomplete="off"
          spellcheck="false"
          {oninput}
          {onkeydown}
        />
        <!-- Out of the tab order: the search box carries the keyboard, so Tab leaves the picker. -->
        <div class="listbox" id={listboxId} role="listbox" aria-label="FORCE 2020 wells" tabindex="-1" bind:this={listbox}>
          {#each groups as group (group.quadrant)}
            {@const headingId = `${uid}-q-${group.quadrant ?? "other"}`}
            <div role="group" aria-labelledby={headingId}>
              <div class="heading" id={headingId} role="presentation">
                {group.quadrant === null ? "Other" : `Quadrant ${group.quadrant}`}
              </div>
              {#each group.wells as well (well.id)}
                <!-- Focus stays in the search box (aria-activedescendant), so the options take pointer input only. -->
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <div
                  id={optionId(well.id)}
                  class="option"
                  class:active={well === activeWell}
                  role="option"
                  tabindex="-1"
                  aria-selected={well.id === current?.id}
                  onpointerdown={(event) => event.preventDefault()}
                  onpointermove={() => (active = matches.indexOf(well))}
                  onclick={() => pick(well)}
                >
                  {well.name}
                </div>
              {/each}
            </div>
          {:else}
            <p class="message">No well matches “{query}”</p>
          {/each}
        </div>
      {:else if list.kind === "loading"}
        <p class="message" role="status">Loading the well list…</p>
      {:else}
        <div class="message" role="alert">
          <span>Couldn't load the well list</span>
          <button type="button" class="retry" onclick={onretry}>Retry</button>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .well-picker {
    position: relative;
  }

  .trigger {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    max-width: 14rem;
    height: 32px;
    padding: 0 var(--spacing-sm);
    font: inherit;
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--color-text);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    cursor: pointer;
  }

  .trigger:hover {
    border-color: var(--color-border-strong);
  }

  .trigger:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }

  .label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chevron {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    color: var(--color-text-muted);
  }

  .popover {
    outline: none;
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    z-index: 20;
    display: flex;
    flex-direction: column;
    width: min(18rem, calc(100vw - 2 * var(--spacing-sm)));
    max-height: min(28rem, 70vh);
    background: var(--color-surface-elevated);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
  }

  .search {
    margin: var(--spacing-sm);
    padding: var(--spacing-xs) var(--spacing-sm);
    font: inherit;
    font-size: var(--font-size-sm);
    color: var(--color-text);
    background: var(--color-surface-sunken);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
  }

  .search:focus {
    outline: 2px solid var(--color-accent);
    outline-offset: -1px;
  }

  .listbox {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding-bottom: var(--spacing-xs);
  }

  .heading {
    position: sticky;
    top: 0;
    padding: var(--spacing-xs) var(--spacing-sm);
    font-size: var(--font-size-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-text-muted);
    background: var(--color-surface-elevated);
  }

  .option {
    padding: 4px var(--spacing-sm) 4px var(--spacing-md);
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
    color: var(--color-text);
    cursor: pointer;
  }

  .option.active {
    background: var(--color-accent-soft);
  }

  .option[aria-selected="true"] {
    font-weight: 600;
    color: var(--color-accent);
  }

  .message {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-sm);
    margin: 0;
    padding: var(--spacing-sm);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .retry {
    padding: 2px var(--spacing-sm);
    font: inherit;
    color: var(--color-accent);
    background: none;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    cursor: pointer;
  }

  @media (max-width: 480px) {
    .trigger {
      max-width: 9rem;
    }
  }
</style>
