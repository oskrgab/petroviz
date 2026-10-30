<script lang="ts">
  /**
   * The MD/TVDSS toggle (#33, #48). It shows the depth reference drawn,
   * never the stored preference, so on a well log without TVDSS MD is
   * selected and TVDSS is unavailable, with its reason as a tooltip; the
   * top bar keeps its shape across wells. A click writes the bound depth
   * reference, MD included, as any user action does.
   *
   * TVDSS is marked aria-disabled rather than disabled, so its tooltip
   * still shows on hover and it can still be reached by keyboard.
   */

  import { DEPTH_REF_LABELS, type DepthRef } from "./interval.ts";
  import { getLogView } from "./logView.svelte.ts";

  const view = getLogView();
  const options: readonly { ref: DepthRef; title: string }[] = [
    { ref: "md", title: "Measured depth, along the wellbore" },
    { ref: "tvdss", title: "True vertical depth below sea level" },
  ];

  function pick(ref: DepthRef) {
    if (ref === "tvdss" && !view.hasTvdss) return;
    view.setDepthRef(ref);
  }
</script>

<div class="depth-ref" role="group" aria-label="Depth reference">
  {#each options as { ref, title } (ref)}
    {@const unavailable = ref === "tvdss" && !view.hasTvdss}
    <button
      type="button"
      aria-pressed={view.effectiveDepthRef === ref}
      aria-disabled={unavailable}
      title={unavailable ? "This well log has no TVDSS" : title}
      onclick={() => pick(ref)}
    >
      {DEPTH_REF_LABELS[ref]}
    </button>
  {/each}
</div>

<style>
  .depth-ref {
    display: inline-flex;
    font-size: 0.8125rem;
  }

  button {
    padding: 0.25rem 0.5rem;
    font: inherit;
    font-weight: 500;
    color: var(--welllog-text);
    background: transparent;
    border: 1px solid var(--welllog-border);
    cursor: pointer;
  }

  button + button {
    margin-left: -1px;
  }

  button:first-child {
    border-radius: 4px 0 0 4px;
  }

  button:last-child {
    border-radius: 0 4px 4px 0;
  }

  button:hover {
    position: relative;
    border-color: var(--welllog-accent);
  }

  button[aria-pressed="true"] {
    position: relative;
    color: var(--welllog-accent);
    border-color: var(--welllog-accent);
  }

  button[aria-disabled="true"] {
    color: var(--welllog-text-muted);
    border-color: var(--welllog-border);
    cursor: not-allowed;
    opacity: 0.6;
  }

  button:focus-visible {
    position: relative;
    outline: 2px solid var(--welllog-accent);
    outline-offset: 1px;
  }
</style>
