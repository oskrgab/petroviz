<script lang="ts">
  /**
   * The shell of the log view's one popup (the curve editor, the add-curve
   * picker): a dialog in the top layer (a manual popover), so no track's
   * overflow cuts it off, placed beside the element that opened it with
   * popupPlacement and placed again when its size changes.
   *
   * It takes focus when it opens. Escape closes it and gives focus back to
   * what opened it; so does a press outside it, except on another popup
   * anchor (`data-popup-anchor`), whose own click opens that one or closes
   * this.
   */

  import type { Snippet } from "svelte";
  import { popupPlacement } from "./placement.ts";

  interface Props {
    anchor: HTMLElement;
    label: string;
    onclose: () => void;
    /** A CSS width. */
    width?: string;
    children: Snippet;
  }

  let { anchor, label, onclose, width = "17rem", children }: Props = $props();

  let popup: HTMLElement;
  let place = $state.raw({ left: 0, top: 0 });

  function placeIt() {
    place = popupPlacement(
      anchor.getBoundingClientRect(),
      { width: popup.offsetWidth, height: popup.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight },
    );
  }

  function close({ refocus }: { refocus: boolean }) {
    // Read before closing: the props go with the popup.
    const opener = anchor.matches("button") ? anchor : anchor.querySelector("button");
    onclose();
    if (refocus) opener?.focus();
  }

  $effect(() => {
    popup.showPopover();
    placeIt();
    popup.focus();
    const resized = new ResizeObserver(placeIt);
    resized.observe(popup);

    function onpointerdown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node) || popup.contains(target)) return;
      if (target instanceof Element && target.closest("[data-popup-anchor]")) return;
      close({ refocus: false });
    }
    window.addEventListener("pointerdown", onpointerdown, true);
    window.addEventListener("resize", placeIt);
    return () => {
      resized.disconnect();
      window.removeEventListener("pointerdown", onpointerdown, true);
      window.removeEventListener("resize", placeIt);
      if (popup.matches(":popover-open")) popup.hidePopover();
    };
  });

  function onkeydown(event: KeyboardEvent) {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    close({ refocus: true });
  }
</script>

<div
  class="popup"
  popover="manual"
  role="dialog"
  aria-label={label}
  tabindex="-1"
  bind:this={popup}
  style:width={width}
  style:left="{place.left}px"
  style:top="{place.top}px"
  {onkeydown}
>
  {@render children()}
</div>

<style>
  .popup {
    position: fixed;
    inset: auto;
    margin: 0;
    max-height: calc(100vh - 16px);
    overflow-y: auto;
    padding: 0;
    font-size: 0.75rem;
    line-height: 1.35;
    color: var(--welllog-text);
    background: var(--welllog-header-bg);
    border: 1px solid var(--welllog-border);
    border-radius: 6px;
    box-shadow: 0 8px 24px rgb(15 23 42 / 0.22);
  }

  .popup:focus {
    outline: none;
  }
</style>
