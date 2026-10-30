/**
 * The depth cursor's pointer handling, as one attachment on the track grid:
 * over a track body, or while a drag on one is under way, the pointer's
 * height is written to view.pointer; anywhere else (headers, the overview
 * strip, outside the grid) it is cleared. The cursor line, the header
 * readout and the floating card follow from it.
 *
 * Glue only: the readout is pure (readout.ts). Checked in the app.
 */

import type { Attachment } from "svelte/attachments";
import { TRACK_BODY } from "./gestures.ts";
import type { LogViewState } from "./logView.svelte.ts";

export function depthCursor(view: LogViewState): Attachment<HTMLElement> {
  return (grid) => {
    // During a drag the grid holds pointer capture, so the target is the grid
    // itself; every body shares one row, so any body's rect will do.
    const bodyUnder = (event: PointerEvent) =>
      (event.target instanceof Element ? event.target.closest<HTMLElement>(`[${TRACK_BODY}]`) : null) ??
      (grid.dataset.dragging !== undefined ? grid.querySelector<HTMLElement>(`[${TRACK_BODY}]`) : null);

    function onpointermove(event: PointerEvent) {
      const body = bodyUnder(event);
      if (!body) {
        view.pointer = null;
        return;
      }
      const rect = body.getBoundingClientRect();
      view.pointer = {
        y: Math.min(Math.max(event.clientY - rect.top, 0), rect.height),
        height: rect.height,
        clientX: event.clientX,
        clientY: event.clientY,
      };
    }

    function onpointerleave() {
      view.pointer = null;
    }

    // A touch has no hover: the cursor follows the finger and goes with it.
    function onpointerup(event: PointerEvent) {
      if (event.pointerType !== "mouse") view.pointer = null;
    }

    grid.addEventListener("pointermove", onpointermove);
    grid.addEventListener("pointerdown", onpointermove);
    grid.addEventListener("pointerleave", onpointerleave);
    grid.addEventListener("pointerup", onpointerup);
    grid.addEventListener("pointercancel", onpointerleave);
    return () => {
      grid.removeEventListener("pointermove", onpointermove);
      grid.removeEventListener("pointerdown", onpointermove);
      grid.removeEventListener("pointerleave", onpointerleave);
      grid.removeEventListener("pointerup", onpointerup);
      grid.removeEventListener("pointercancel", onpointerleave);
    };
  };
}
