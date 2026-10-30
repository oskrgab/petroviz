/**
 * Rearranging tracks with a mouse (#56), as attachments: drag a header
 * sideways to reorder its track, and drag a track's border to resize it
 * (double-click resets it). On touch, the ⋯ menu moves tracks instead.
 *
 * Glue only: where a track lands and how wide it becomes come from the pure
 * functions in reorder.ts and widths.ts, previewed through view.dragging and
 * view.resizing, and written to the template through view.edit on release.
 * Checked in the app.
 */

import type { Attachment } from "svelte/attachments";
import type { LogViewState } from "./logView.svelte.ts";
import { dropEdge, dropIndex } from "./reorder.ts";
import { resizedWidth } from "./widths.ts";

/** Marks a track header in LogView, with its track's id. */
const TRACK_HEADER = "data-track-header";

/** Marks what a press may start on without dragging its header: buttons beside it, the border. */
const NO_HEADER_DRAG = "data-no-header-drag";

/** A press that moves less than this many CSS px sideways is a click, not a drag. */
const DRAG_SLOP_PX = 4;

/**
 * A click ends a drag that began on a scale bar; it must not also open the
 * curve editor. Swallowed once, in the capture phase, if it comes at all.
 */
function swallowNextClick(target: HTMLElement) {
  const swallow = (event: MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
  };
  target.addEventListener("click", swallow, { capture: true, once: true });
  setTimeout(() => target.removeEventListener("click", swallow, { capture: true }));
}

/** Header drag, as one attachment on the track grid. Mouse and pen only: a finger scrolls the row. */
export function headerDrag(view: LogViewState): Attachment<HTMLElement> {
  return (grid) => {
    let press: { pointerId: number; x: number; trackId: string } | null = null;
    let measured: { from: number; centres: number[]; edges: { left: number; right: number }[] } | null = null;

    function measure(trackId: string) {
      const headers = [...grid.querySelectorAll<HTMLElement>(`[${TRACK_HEADER}]`)];
      const left = grid.getBoundingClientRect().left;
      const edges = headers.map((header) => {
        const rect = header.getBoundingClientRect();
        return { left: rect.left - left, right: rect.right - left };
      });
      return {
        from: headers.findIndex((header) => header.getAttribute(TRACK_HEADER) === trackId),
        centres: edges.map((edge) => (edge.left + edge.right) / 2),
        edges,
      };
    }

    function onpointerdown(event: PointerEvent) {
      if (event.pointerType === "touch" || event.button !== 0 || !(event.target instanceof Element)) return;
      if (event.target.closest(`[${NO_HEADER_DRAG}]`)) return;
      const header = event.target.closest<HTMLElement>(`[${TRACK_HEADER}]`);
      if (!header) return;
      press = { pointerId: event.pointerId, x: event.clientX, trackId: header.getAttribute(TRACK_HEADER)! };
    }

    function onpointermove(event: PointerEvent) {
      if (event.pointerId !== press?.pointerId) return;
      const dx = event.clientX - press.x;
      if (!measured) {
        if (Math.abs(dx) <= DRAG_SLOP_PX) return;
        measured = measure(press.trackId);
        if (measured.from < 0) return cancel();
        grid.setPointerCapture(event.pointerId);
      }
      const { from, centres, edges } = measured;
      const to = dropIndex(centres, from, centres[from] + dx);
      view.dragging = { trackId: press.trackId, dx, to, edge: dropEdge(edges, from, to) };
    }

    function onpointerup(event: PointerEvent) {
      if (event.pointerId !== press?.pointerId) return;
      const drag = view.dragging;
      cancel();
      if (!drag) return;
      swallowNextClick(grid);
      if (event.type === "pointerup") view.edit({ kind: "move-track", trackId: drag.trackId, to: drag.to });
    }

    function cancel() {
      press = measured = null;
      view.dragging = null;
    }

    grid.addEventListener("pointerdown", onpointerdown);
    grid.addEventListener("pointermove", onpointermove);
    grid.addEventListener("pointerup", onpointerup);
    grid.addEventListener("pointercancel", onpointerup);
    return () => {
      grid.removeEventListener("pointerdown", onpointerdown);
      grid.removeEventListener("pointermove", onpointermove);
      grid.removeEventListener("pointerup", onpointerup);
      grid.removeEventListener("pointercancel", onpointerup);
      cancel();
    };
  };
}

/**
 * Border drag, as an attachment on the handle at a track header's right
 * edge. `available` is the room the tracks have, in CSS px: the scrolling
 * row's width less the overview strip and the ＋ after the tracks.
 */
export function borderResize(view: LogViewState, trackId: string, available: () => number): Attachment<HTMLElement> {
  return (handle) => {
    let press: {
      pointerId: number;
      /** The pointer's offset from the border, so the border moves with it without a jump. */
      offset: number;
      /** The first track's left edge, which a resize never moves. */
      start: number;
      width: number;
      before: number;
      after: number;
    } | null = null;

    function onpointerdown(event: PointerEvent) {
      if (event.button !== 0) return;
      const header = handle.closest<HTMLElement>(`[${TRACK_HEADER}]`);
      // Every header sits in the track grid; the first is the first track's.
      const first = header?.parentElement?.querySelector<HTMLElement>(`[${TRACK_HEADER}]`);
      const tracks = view.template.tracks;
      const index = tracks.findIndex((t) => t.id === trackId);
      if (!header || !first || index < 0) return;
      // Neither a header drag nor a pan starts here.
      event.stopPropagation();
      handle.setPointerCapture(event.pointerId);
      const sum = (from: number, to?: number) => tracks.slice(from, to).reduce((total, t) => total + t.width, 0);
      press = {
        pointerId: event.pointerId,
        offset: event.clientX - header.getBoundingClientRect().right,
        start: first.getBoundingClientRect().left,
        width: tracks[index].width,
        before: sum(0, index),
        after: sum(index + 1),
      };
    }

    function onpointermove(event: PointerEvent) {
      if (event.pointerId !== press?.pointerId) return;
      const { width, before, after } = press;
      const edge = event.clientX - press.offset - press.start;
      view.resizing = { trackId, width: resizedWidth({ width, before, after, available: available(), edge }) };
    }

    function onpointerup(event: PointerEvent) {
      if (event.pointerId !== press?.pointerId) return;
      const resized = view.resizing;
      press = null;
      view.resizing = null;
      if (resized && event.type === "pointerup") view.edit({ kind: "set-track-width", trackId, width: resized.width });
    }

    function ondblclick() {
      view.edit({ kind: "reset-track-width", trackId });
    }

    handle.addEventListener("pointerdown", onpointerdown);
    handle.addEventListener("pointermove", onpointermove);
    handle.addEventListener("pointerup", onpointerup);
    handle.addEventListener("pointercancel", onpointerup);
    handle.addEventListener("dblclick", ondblclick);
    return () => {
      handle.removeEventListener("pointerdown", onpointerdown);
      handle.removeEventListener("pointermove", onpointermove);
      handle.removeEventListener("pointerup", onpointerup);
      handle.removeEventListener("pointercancel", onpointerup);
      handle.removeEventListener("dblclick", ondblclick);
    };
  };
}
